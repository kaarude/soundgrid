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

pub struct DecodedAudio {
    pub samples: Vec<f32>,
    pub channels: usize,
    pub sample_rate: u32,
}

pub fn decode(path: &str) -> Result<DecodedAudio> {
    let file = File::open(path).with_context(|| format!("cannot open audio file: {path}"))?;
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
        append_interleaved(&decoded, &mut samples);
    }

    anyhow::ensure!(!samples.is_empty(), "audio file decoded to no samples");
    Ok(DecodedAudio {
        samples,
        channels,
        sample_rate,
    })
}

fn append_interleaved(buffer: &AudioBufferRef<'_>, output: &mut Vec<f32>) {
    let channels = buffer.spec().channels.count();
    let frames = buffer.frames();
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
            output.extend_from_slice(converted.samples());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::decode;
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
        assert!(decoded.samples[1] > 0.99);
        assert!(decoded.samples[2] <= -1.0);
    }
}
