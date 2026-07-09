use anyhow::{Context, Result};
use std::{fs::File, path::Path};
use symphonia::core::{
    audio::{AudioBufferRef, Signal},
    codecs::DecoderOptions,
    errors::Error as SymphoniaError,
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};

#[derive(Debug)]
pub struct DecodedAudio {
    pub samples: Vec<f32>,
    pub channels: usize,
    pub sample_rate: u32,
}

const MAX_AUDIO_FILE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_DECODED_SAMPLES: usize = 48_000 * 2 * 60 * 10;
const MAX_CHANNELS: usize = 8;
const MAX_SAMPLE_RATE: u32 = 192_000;

pub fn decode(path: &str) -> Result<DecodedAudio> {
    let file = File::open(path).with_context(|| format!("cannot open audio file: {path}"))?;
    let size = file
        .metadata()
        .with_context(|| format!("cannot inspect audio file: {path}"))?
        .len();
    anyhow::ensure!(
        size <= MAX_AUDIO_FILE_BYTES,
        "audio file is larger than the {} MiB limit",
        MAX_AUDIO_FILE_BYTES / 1024 / 1024
    );
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = Path::new(path).extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .context("unsupported or corrupt audio container")?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .context("audio file contains no playable track")?;
    let track_id = track.id;
    let sample_rate = track
        .codec_params
        .sample_rate
        .context("audio sample rate is missing")?;
    let channels = track
        .codec_params
        .channels
        .context("audio channel layout is missing")?
        .count();
    anyhow::ensure!(
        channels > 0 && channels <= MAX_CHANNELS,
        "audio channel count exceeds the {MAX_CHANNELS} channel limit"
    );
    anyhow::ensure!(
        sample_rate <= MAX_SAMPLE_RATE,
        "audio sample rate exceeds the {MAX_SAMPLE_RATE} Hz limit"
    );
    let max_decoded_samples = MAX_DECODED_SAMPLES.min(
        sample_rate
            .saturating_mul(channels as u32)
            .saturating_mul(60 * 10) as usize,
    );
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .context("unsupported audio codec")?;
    let mut samples = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break
            }
            Err(error) => return Err(error).context("failed reading audio packet"),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(error) => return Err(error).context("failed decoding audio packet"),
        };
        append_interleaved(&decoded, &mut samples, max_decoded_samples)?;
    }

    anyhow::ensure!(!samples.is_empty(), "audio file decoded to no samples");
    normalize_peak(&mut samples);
    Ok(DecodedAudio {
        samples,
        channels,
        sample_rate,
    })
}

fn normalize_peak(samples: &mut [f32]) {
    const TARGET_PEAK: f32 = 0.9;
    const MIN_NORMALIZABLE_PEAK: f32 = 0.01;
    let peak = samples
        .iter()
        .fold(0.0_f32, |current, sample| current.max(sample.abs()));
    // Normalize audible clips in both directions so cues land at a consistent
    // level. Near-silence is left alone to avoid amplifying a noise floor.
    if peak >= MIN_NORMALIZABLE_PEAK && (peak - TARGET_PEAK).abs() > f32::EPSILON {
        let gain = TARGET_PEAK / peak;
        for sample in samples {
            *sample *= gain;
        }
    }
}

fn append_interleaved(
    buffer: &AudioBufferRef<'_>,
    output: &mut Vec<f32>,
    max_samples: usize,
) -> Result<()> {
    let channels = buffer.spec().channels.count();
    let frames = buffer.frames();
    let incoming = frames
        .checked_mul(channels)
        .context("decoded audio sample count overflowed")?;
    anyhow::ensure!(
        output.len().saturating_add(incoming) <= max_samples,
        "audio clip exceeds the decoded sample limit"
    );
    match buffer {
        AudioBufferRef::F32(data) => {
            for frame in 0..frames {
                for channel in 0..channels {
                    output.push(data.chan(channel)[frame]);
                }
            }
        }
        _ => {
            let mut converted = symphonia::core::audio::SampleBuffer::<f32>::new(
                buffer.capacity() as u64,
                *buffer.spec(),
            );
            converted.copy_interleaved_ref(buffer.clone());
            let converted_samples = converted.samples();
            anyhow::ensure!(
                output.len().saturating_add(converted_samples.len()) <= max_samples,
                "audio clip exceeds the decoded sample limit"
            );
            output.extend_from_slice(converted_samples);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{decode, normalize_peak, MAX_AUDIO_FILE_BYTES};
    use std::{fs, time::SystemTime};

    #[test]
    fn decodes_pcm_wave_to_interleaved_f32() {
        let mut path = std::env::temp_dir();
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("soundgrid-decoder-{unique}.wav"));

        let pcm: [i16; 4] = [0, i16::MAX, i16::MIN, 1024];
        let data_len = (pcm.len() * 2) as u32;
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_len).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16_u32.to_le_bytes());
        wav.extend_from_slice(&1_u16.to_le_bytes());
        wav.extend_from_slice(&1_u16.to_le_bytes());
        wav.extend_from_slice(&48_000_u32.to_le_bytes());
        wav.extend_from_slice(&96_000_u32.to_le_bytes());
        wav.extend_from_slice(&2_u16.to_le_bytes());
        wav.extend_from_slice(&16_u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_len.to_le_bytes());
        for sample in pcm {
            wav.extend_from_slice(&sample.to_le_bytes());
        }
        fs::write(&path, wav).unwrap();

        let decoded = decode(path.to_str().unwrap()).unwrap();
        fs::remove_file(path).unwrap();
        assert_eq!(decoded.channels, 1);
        assert_eq!(decoded.sample_rate, 48_000);
        assert_eq!(decoded.samples.len(), 4);
        assert!(decoded.samples[1] > 0.89);
        assert!(decoded.samples[2] <= -0.89);
        assert!(decoded.samples.iter().all(|sample| sample.abs() <= 0.901));
    }

    #[test]
    fn rejects_oversized_audio_before_decode() {
        let mut path = std::env::temp_dir();
        let unique = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        path.push(format!("soundgrid-decoder-oversized-{unique}.wav"));
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_AUDIO_FILE_BYTES + 1).unwrap();

        let error = decode(path.to_str().unwrap()).unwrap_err();
        fs::remove_file(path).unwrap();
        assert!(error.to_string().contains("larger than"));
    }

    #[test]
    fn normalizes_audible_peaks_but_does_not_raise_near_silence() {
        let mut audible = [0.1, -0.2, 0.05];
        normalize_peak(&mut audible);
        assert!((audible[1] + 0.9).abs() < 0.0001);

        let mut near_silent = [0.001, -0.002];
        normalize_peak(&mut near_silent);
        assert_eq!(near_silent, [0.001, -0.002]);
    }
}
