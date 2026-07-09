mod decoder;
mod protocol;

use anyhow::{Context, Result};
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Device, DeviceId, DeviceType, FromSample, Sample, SampleFormat, SizedSample, Stream,
    StreamConfig,
};
use decoder::DecodedAudio;
use protocol::{Bus, BusName, Command, DeviceInfo, DeviceKind, Event, MixMode};
use std::str::FromStr;
use std::{
    collections::VecDeque,
    io::{self, BufRead, Write},
    sync::{
        atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
        mpsc::{self, SyncSender},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

static NEXT_VOICE_INSTANCE: AtomicU64 = AtomicU64::new(1);

struct Voice {
    instance_id: u64,
    clip_id: String,
    audio: Arc<DecodedAudio>,
    position: f64,
    start_frame: usize,
    end_frame: usize,
    volume: f32,
    looped: bool,
}

struct CaptureBuffer {
    samples: VecDeque<f32>,
    input_rate: u32,
    output_rate: u32,
    phase: f64,
    started: bool,
}

impl Default for CaptureBuffer {
    fn default() -> Self {
        Self {
            samples: VecDeque::new(),
            input_rate: 0,
            output_rate: 0,
            phase: 0.0,
            started: false,
        }
    }
}

impl CaptureBuffer {
    fn reset(&mut self) {
        self.samples.clear();
        self.input_rate = 0;
        self.output_rate = 0;
        self.phase = 0.0;
        self.started = false;
    }

    fn push(&mut self, sample: f32) {
        self.samples.push_back(sample);
        let capacity = self.input_rate.max(48_000) as usize * 2;
        while self.samples.len() > capacity {
            self.samples.pop_front();
        }
    }

    fn next_resampled(&mut self) -> f32 {
        if self.input_rate == 0 || self.output_rate == 0 {
            return 0.0;
        }
        let target = (self.input_rate as usize / 20).max(2);
        if !self.started {
            if self.samples.len() < target {
                return 0.0;
            }
            self.started = true;
        }
        if self.samples.len() < 2 {
            self.started = false;
            self.phase = 0.0;
            return 0.0;
        }

        let a = self.samples[0];
        let b = self.samples[1];
        let value = a + (b - a) * self.phase as f32;
        let fill_error = (self.samples.len() as f64 - target as f64) / target as f64;
        let correction = 1.0 + (fill_error * 0.002).clamp(-0.005, 0.005);
        self.phase += self.input_rate as f64 / self.output_rate as f64 * correction;
        while self.phase >= 1.0 && self.samples.len() > 1 {
            self.samples.pop_front();
            self.phase -= 1.0;
        }
        value
    }
}

struct BusState {
    voices: Vec<Voice>,
    paused: bool,
    muted: bool,
    volume: f32,
    overlap: MixMode,
}

impl Default for BusState {
    fn default() -> Self {
        Self {
            voices: Vec::new(),
            paused: false,
            muted: false,
            volume: 1.0,
            overlap: MixMode::Stop,
        }
    }
}

struct Engine {
    host: cpal::Host,
    mic: Arc<Mutex<BusState>>,
    monitor: Arc<Mutex<BusState>>,
    capture: Arc<Mutex<CaptureBuffer>>,
    mic_meter: Arc<AtomicU32>,
    monitor_meter: Arc<AtomicU32>,
    mic_stream: Option<Stream>,
    monitor_stream: Option<Stream>,
    capture_stream: Option<Stream>,
    ended_tx: SyncSender<(BusName, String)>,
}

impl Engine {
    fn new(ended_tx: SyncSender<(BusName, String)>) -> Self {
        Self {
            host: cpal::default_host(),
            mic: Arc::new(Mutex::new(BusState::default())),
            monitor: Arc::new(Mutex::new(BusState::default())),
            capture: Arc::new(Mutex::new(CaptureBuffer::default())),
            mic_meter: Arc::new(AtomicU32::new(0)),
            monitor_meter: Arc::new(AtomicU32::new(0)),
            mic_stream: None,
            monitor_stream: None,
            capture_stream: None,
            ended_tx,
        }
    }

    fn devices(&self, include_inputs: bool) -> Result<(Vec<DeviceInfo>, Vec<DeviceInfo>)> {
        let outputs = enumerate(
            self.host
                .output_devices()
                .context("cannot enumerate output devices")?,
            DeviceDirection::Output,
        )?;
        let inputs = if include_inputs {
            enumerate(
                self.host
                    .input_devices()
                    .context("cannot enumerate input devices")?,
                DeviceDirection::Input,
            )?
        } else {
            Vec::new()
        };
        Ok((outputs, inputs))
    }

    #[allow(clippy::too_many_arguments)]
    fn configure(
        &mut self,
        mic_output_id: Option<String>,
        monitor_id: Option<String>,
        real_mic_id: Option<String>,
        passthrough: bool,
        mic_volume: f32,
        monitor_volume: f32,
        monitor_enabled: bool,
        overlap: MixMode,
    ) -> Result<()> {
        self.mic_stream = None;
        self.monitor_stream = None;
        self.capture_stream = None;
        self.capture.lock().expect("capture mutex poisoned").reset();

        {
            let mut mic = self.mic.lock().expect("mic mutex poisoned");
            mic.volume = clamp01(mic_volume);
            mic.overlap = overlap;
        }
        {
            let mut monitor = self.monitor.lock().expect("monitor mutex poisoned");
            monitor.volume = clamp01(monitor_volume);
            monitor.overlap = overlap;
        }

        let mic_device = select(&self.host, mic_output_id.as_deref())?;
        let monitor_device = if monitor_enabled {
            Some(
                select_output(&self.host, monitor_id.as_deref())?
                    .context("no monitor playback device is available")?,
            )
        } else {
            None
        };
        let capture_device = if passthrough && mic_device.is_some() {
            anyhow::ensure!(
                mic_output_id.as_deref() != real_mic_id.as_deref(),
                "real microphone cannot be the mic output loopback device"
            );
            let input = select(&self.host, real_mic_id.as_deref())?;
            if let Some(device) = &input {
                anyhow::ensure!(
                    !is_virtual_input(device)?,
                    "real microphone cannot be a virtual loopback device"
                );
            }
            input
        } else {
            None
        };

        if let Some(device) = mic_device {
            self.mic_stream = Some(build_output(
                &device,
                self.mic.clone(),
                Some(self.capture.clone()),
                self.mic_meter.clone(),
                BusName::Mic,
                self.ended_tx.clone(),
            )?);
        }
        if let Some(device) = monitor_device {
            self.monitor_stream = Some(build_output(
                &device,
                self.monitor.clone(),
                None,
                self.monitor_meter.clone(),
                BusName::Monitor,
                self.ended_tx.clone(),
            )?);
        }

        if let Some(input) = capture_device {
            self.capture_stream = Some(build_input(&input, self.capture.clone())?);
        }

        if let Some(stream) = &self.mic_stream {
            stream.play().context("cannot start mic output")?;
        }
        if let Some(stream) = &self.monitor_stream {
            stream.play().context("cannot start monitor output")?;
        }
        if let Some(stream) = &self.capture_stream {
            stream.play().context("cannot start microphone capture")?;
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn play(
        &self,
        bus: Bus,
        id: String,
        path: String,
        volume: f32,
        trim_start: f32,
        trim_end: f32,
        looped: bool,
    ) -> Result<()> {
        let audio = Arc::new(decoder::decode(&path)?);
        let (start_frame, end_frame) = playback_bounds(&audio, trim_start, trim_end)?;
        let state = match bus {
            Bus::Mic => &self.mic,
            Bus::Monitor => &self.monitor,
        };
        let mut state = state.lock().expect("bus mutex poisoned");
        match state.overlap {
            MixMode::Stop => state.voices.clear(),
            MixMode::Overlap | MixMode::Queue => {}
        }
        state.paused = false;
        state.voices.push(Voice {
            instance_id: NEXT_VOICE_INSTANCE.fetch_add(1, Ordering::Relaxed),
            clip_id: id,
            audio,
            position: start_frame as f64,
            start_frame,
            end_frame,
            volume: clamp01(volume),
            looped,
        });
        Ok(())
    }

    fn with_bus(&self, bus: Bus, action: impl FnOnce(&mut BusState)) {
        let state = match bus {
            Bus::Mic => &self.mic,
            Bus::Monitor => &self.monitor,
        };
        action(&mut state.lock().expect("bus mutex poisoned"));
    }
}

fn main() -> Result<()> {
    let (ended_tx, ended_rx) = mpsc::sync_channel::<(BusName, String)>(128);
    let mut engine = Engine::new(ended_tx);
    let running = Arc::new(AtomicBool::new(true));

    let event_running = running.clone();
    let mic_meter = engine.mic_meter.clone();
    let monitor_meter = engine.monitor_meter.clone();
    thread::spawn(move || {
        while event_running.load(Ordering::Relaxed) {
            while let Ok((bus, clip_id)) = ended_rx.try_recv() {
                emit(&Event::ClipEnded { bus, clip_id });
            }
            emit(&Event::Meter {
                mic: f32::from_bits(mic_meter.swap(0, Ordering::Relaxed)),
                monitor: f32::from_bits(monitor_meter.swap(0, Ordering::Relaxed)),
            });
            thread::sleep(Duration::from_millis(50));
        }
    });

    emit(&Event::Ready);
    for line in io::stdin().lock().lines() {
        let line = match line {
            Ok(line) if !line.trim().is_empty() => line,
            Ok(_) => continue,
            Err(error) => {
                emit_error(error);
                break;
            }
        };
        let command: Command = match serde_json::from_str(&line) {
            Ok(command) => command,
            Err(error) => {
                emit_error(format!("invalid command: {error}"));
                continue;
            }
        };
        let result = handle(&mut engine, command);
        match result {
            Ok(true) => break,
            Ok(false) => {}
            Err(error) => emit_error(format!("{error:#}")),
        }
    }
    running.store(false, Ordering::Relaxed);
    Ok(())
}

fn handle(engine: &mut Engine, command: Command) -> Result<bool> {
    match command {
        Command::ListDevices { include_inputs } => {
            let (outputs, inputs) = engine.devices(include_inputs)?;
            emit(&Event::Devices { outputs, inputs });
        }
        Command::Configure {
            mic_output_device_id,
            monitor_device_id,
            real_mic_device_id,
            passthrough,
            mic_volume,
            monitor_volume,
            monitor_enabled,
            overlap,
        } => engine.configure(
            mic_output_device_id,
            monitor_device_id,
            real_mic_device_id,
            passthrough,
            mic_volume,
            monitor_volume,
            monitor_enabled,
            overlap,
        )?,
        Command::Play {
            bus,
            clip_id,
            path,
            volume,
            trim_start,
            trim_end,
            looped,
        } => engine.play(bus, clip_id, path, volume, trim_start, trim_end, looped)?,
        Command::Pause { bus } => engine.with_bus(bus, |state| state.paused = true),
        Command::Resume { bus } => engine.with_bus(bus, |state| state.paused = false),
        Command::Stop { bus } => engine.with_bus(bus, |state| state.voices.clear()),
        Command::StopAll => {
            engine.with_bus(Bus::Mic, |state| state.voices.clear());
            engine.with_bus(Bus::Monitor, |state| state.voices.clear());
        }
        Command::SetMute { bus, muted } => engine.with_bus(bus, |state| state.muted = muted),
        Command::SetVolume { bus, volume } => {
            engine.with_bus(bus, |state| state.volume = clamp01(volume))
        }
        Command::Shutdown => return Ok(true),
    }
    Ok(false)
}

#[derive(Clone, Copy)]
enum DeviceDirection {
    Input,
    Output,
}

fn enumerate(
    devices: impl Iterator<Item = Device>,
    direction: DeviceDirection,
) -> Result<Vec<DeviceInfo>> {
    devices
        .map(|device| describe_device(&device, direction))
        .collect()
}

fn select_output(host: &cpal::Host, id: Option<&str>) -> Result<Option<Device>> {
    let selected = select(host, id)?;
    Ok(selected.or_else(|| host.default_output_device()))
}

fn select(host: &cpal::Host, id: Option<&str>) -> Result<Option<Device>> {
    let Some(id) = id else { return Ok(None) };
    if let Ok(device_id) = DeviceId::from_str(id) {
        if let Some(device) = host.device_by_id(&device_id) {
            return Ok(Some(device));
        }
    }
    // One-time compatibility with v0.1.0's unstable `index:label` IDs.
    if let Some((_, legacy_label)) = id.split_once(':') {
        for device in host.devices().context("cannot enumerate audio devices")? {
            if device
                .description()
                .map(|value| value.name() == legacy_label)
                .unwrap_or(false)
            {
                return Ok(Some(device));
            }
        }
    }
    Ok(None)
}

fn describe_device(device: &Device, direction: DeviceDirection) -> Result<DeviceInfo> {
    let description = device
        .description()
        .context("cannot read audio device description")?;
    let id = device.id().context("cannot read stable audio device id")?;
    let label = description
        .extended()
        .first()
        .map(String::as_str)
        .unwrap_or(description.name())
        .to_string();
    let kind = match description.device_type() {
        DeviceType::Headphones => DeviceKind::Headphones,
        DeviceType::Headset => DeviceKind::Headset,
        DeviceType::Speaker => DeviceKind::Speaker,
        DeviceType::Microphone => DeviceKind::Microphone,
        DeviceType::Virtual => DeviceKind::Virtual,
        _ => infer_device_kind(&label, direction),
    };
    Ok(DeviceInfo {
        id: id.to_string(),
        label,
        kind,
    })
}

fn infer_device_kind(label: &str, direction: DeviceDirection) -> DeviceKind {
    let normalized = label.to_lowercase();
    if [
        "blackhole",
        "soundflower",
        "loopback audio",
        "vb-audio",
        "cable input",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
    {
        return DeviceKind::Virtual;
    }
    if [
        "headphone",
        "airpods",
        "earbuds",
        "kopfhörer",
        "casque",
        "cuffie",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
    {
        return DeviceKind::Headphones;
    }
    match direction {
        DeviceDirection::Input
            if normalized.contains("mic") || normalized.contains("microphone") =>
        {
            DeviceKind::Microphone
        }
        DeviceDirection::Output
            if normalized.contains("speaker") || normalized.contains("output") =>
        {
            DeviceKind::Speaker
        }
        _ => DeviceKind::Unknown,
    }
}

fn is_virtual_input(device: &Device) -> Result<bool> {
    let description = device
        .description()
        .context("cannot read input device description")?;
    let label = description
        .extended()
        .first()
        .map(String::as_str)
        .unwrap_or(description.name());
    Ok(matches!(description.device_type(), DeviceType::Virtual)
        || matches!(
            infer_device_kind(label, DeviceDirection::Input),
            DeviceKind::Virtual
        ))
}

fn build_output(
    device: &Device,
    state: Arc<Mutex<BusState>>,
    capture: Option<Arc<Mutex<CaptureBuffer>>>,
    meter: Arc<AtomicU32>,
    bus: BusName,
    ended_tx: SyncSender<(BusName, String)>,
) -> Result<Stream> {
    let supported = device
        .default_output_config()
        .context("no supported output format")?;
    let config: StreamConfig = supported.clone().into();
    if let Some(capture) = &capture {
        capture.lock().expect("capture mutex poisoned").output_rate = config.sample_rate;
    }
    match supported.sample_format() {
        SampleFormat::F32 => {
            build_output_t::<f32>(device, &config, state, capture, meter, bus, ended_tx)
        }
        SampleFormat::I16 => {
            build_output_t::<i16>(device, &config, state, capture, meter, bus, ended_tx)
        }
        SampleFormat::U16 => {
            build_output_t::<u16>(device, &config, state, capture, meter, bus, ended_tx)
        }
        format => anyhow::bail!("unsupported output sample format: {format:?}"),
    }
}

fn build_output_t<T>(
    device: &Device,
    config: &StreamConfig,
    state: Arc<Mutex<BusState>>,
    capture: Option<Arc<Mutex<CaptureBuffer>>>,
    meter: Arc<AtomicU32>,
    bus: BusName,
    ended_tx: SyncSender<(BusName, String)>,
) -> Result<Stream>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = config.channels as usize;
    let sample_rate = config.sample_rate;
    let error_bus = format!("{bus:?}");
    device
        .build_output_stream(
            config,
            move |output: &mut [T], _| {
                let mut peak = 0.0_f32;
                let mut state = state.lock().expect("bus mutex poisoned");
                let queue_mode = matches!(state.overlap, MixMode::Queue);
                let paused = state.paused;
                let gain = if state.muted { 0.0 } else { state.volume };
                let mut finished: Vec<(u64, String)> = Vec::new();
                let mut ended_clips: Vec<String> = Vec::new();
                let mut capture = capture
                    .as_ref()
                    .map(|buffer| buffer.lock().expect("capture mutex poisoned"));

                for frame in output.chunks_mut(channels) {
                    let passthrough = capture
                        .as_mut()
                        .map(|buffer| buffer.next_resampled())
                        .unwrap_or(0.0);
                    for (channel, sample) in frame.iter_mut().enumerate() {
                        let mut value = passthrough;
                        if !paused {
                            for (voice_index, voice) in state.voices.iter().enumerate() {
                                if queue_mode && voice_index > 0 {
                                    break;
                                }
                                value += sample_voice(voice, channel) * voice.volume;
                            }
                        }
                        value = soft_limit(value * gain);
                        peak = peak.max(value.abs());
                        *sample = T::from_sample(value);
                    }
                    if !paused {
                        for (voice_index, voice) in state.voices.iter_mut().enumerate() {
                            if queue_mode && voice_index > 0 {
                                break;
                            }
                            voice.position += voice.audio.sample_rate as f64 / sample_rate as f64;
                            if voice.position >= voice.end_frame as f64 {
                                if voice.looped {
                                    let length = (voice.end_frame - voice.start_frame) as f64;
                                    voice.position = voice.start_frame as f64
                                        + (voice.position - voice.start_frame as f64) % length;
                                } else if !finished
                                    .iter()
                                    .any(|(instance_id, _)| *instance_id == voice.instance_id)
                                {
                                    finished.push((voice.instance_id, voice.clip_id.clone()));
                                }
                            }
                        }
                        if !finished.is_empty() {
                            for clip_id in finish_voices(&mut state, &finished) {
                                if !ended_clips.contains(&clip_id) {
                                    ended_clips.push(clip_id);
                                }
                            }
                            finished.clear();
                        }
                    }
                }
                meter.fetch_max(peak.to_bits(), Ordering::Relaxed);
                for clip_id in ended_clips {
                    let _ = ended_tx.try_send((bus, clip_id));
                }
            },
            move |error| emit_error(format!("{error_bus} output stream failed: {error}")),
            None,
        )
        .context("cannot create output stream")
}

fn finish_voices(state: &mut BusState, finished: &[(u64, String)]) -> Vec<String> {
    state.voices.retain(|voice| {
        !finished
            .iter()
            .any(|(instance_id, _)| *instance_id == voice.instance_id)
    });
    finished
        .iter()
        .filter_map(|(_, clip_id)| {
            (!state.voices.iter().any(|voice| voice.clip_id == *clip_id)).then_some(clip_id.clone())
        })
        .collect()
}

fn sample_voice(voice: &Voice, output_channel: usize) -> f32 {
    if voice.start_frame >= voice.end_frame {
        return 0.0;
    }
    let frame = (voice.position.floor() as usize).clamp(voice.start_frame, voice.end_frame - 1);
    let next = (frame + 1).min(voice.end_frame - 1);
    let fraction = (voice.position - frame as f64) as f32;
    let channel = if voice.audio.channels == 1 {
        0
    } else {
        output_channel.min(voice.audio.channels - 1)
    };
    let a = voice.audio.samples[frame * voice.audio.channels + channel];
    let b = voice.audio.samples[next * voice.audio.channels + channel];
    let interpolated = a + (b - a) * fraction;
    let fade_frames = (voice.audio.sample_rate as usize / 200).max(1); // 5 ms
    let from_start = frame.saturating_sub(voice.start_frame);
    let to_end = voice.end_frame.saturating_sub(frame + 1);
    let envelope = (from_start.min(to_end).min(fade_frames) as f32 / fade_frames as f32).min(1.0);
    interpolated * envelope
}

fn playback_bounds(
    audio: &DecodedAudio,
    trim_start_seconds: f32,
    trim_end_seconds: f32,
) -> Result<(usize, usize)> {
    let frames = audio.samples.len() / audio.channels;
    let seconds_to_frames = |seconds: f32| {
        if seconds.is_finite() {
            (seconds.max(0.0) * audio.sample_rate as f32) as usize
        } else {
            0
        }
    };
    let start = seconds_to_frames(trim_start_seconds).min(frames);
    let end = frames.saturating_sub(seconds_to_frames(trim_end_seconds));
    anyhow::ensure!(start < end, "clip trim removes all playable audio");
    Ok((start, end))
}

fn soft_limit(value: f32) -> f32 {
    const KNEE: f32 = 0.9;
    let magnitude = value.abs();
    if magnitude <= KNEE {
        value
    } else {
        let compressed = KNEE + (1.0 - KNEE) * (1.0 - (-(magnitude - KNEE) / 0.1).exp());
        value.signum() * compressed.min(1.0)
    }
}

fn build_input(device: &Device, capture: Arc<Mutex<CaptureBuffer>>) -> Result<Stream> {
    let supported = device
        .default_input_config()
        .context("no supported input format")?;
    let config: StreamConfig = supported.clone().into();
    capture.lock().expect("capture mutex poisoned").input_rate = config.sample_rate;
    match supported.sample_format() {
        SampleFormat::F32 => build_input_t::<f32>(device, &config, capture),
        SampleFormat::I16 => build_input_t::<i16>(device, &config, capture),
        SampleFormat::U16 => build_input_t::<u16>(device, &config, capture),
        format => anyhow::bail!("unsupported input sample format: {format:?}"),
    }
}

fn build_input_t<T>(
    device: &Device,
    config: &StreamConfig,
    capture: Arc<Mutex<CaptureBuffer>>,
) -> Result<Stream>
where
    T: SizedSample + Sample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    device
        .build_input_stream(
            config,
            move |input: &[T], _| {
                let mut buffer = capture.lock().expect("capture mutex poisoned");
                for frame in input.chunks(channels) {
                    let mono = frame
                        .iter()
                        .map(|sample| sample.to_sample::<f32>())
                        .sum::<f32>()
                        / channels as f32;
                    buffer.push(mono);
                }
            },
            move |error| emit_error(format!("microphone capture failed: {error}")),
            None,
        )
        .context("cannot create microphone capture stream")
}

fn clamp01(value: f32) -> f32 {
    value.clamp(0.0, 1.0)
}

fn emit(event: &Event) {
    if let Ok(line) = serde_json::to_string(event) {
        let stdout = io::stdout();
        let mut stdout = stdout.lock();
        let _ = writeln!(stdout, "{line}");
        let _ = stdout.flush();
    }
}

fn emit_error(error: impl std::fmt::Display) {
    emit(&Event::Error {
        message: error.to_string(),
    });
}

#[cfg(test)]
mod tests {
    use super::{
        finish_voices, infer_device_kind, playback_bounds, sample_voice, soft_limit, BusState,
        CaptureBuffer, DecodedAudio, DeviceDirection, Voice,
    };
    use crate::protocol::DeviceKind;
    use std::sync::Arc;

    fn voice(instance_id: u64, clip_id: &str) -> Voice {
        Voice {
            instance_id,
            clip_id: clip_id.to_string(),
            audio: Arc::new(DecodedAudio {
                samples: vec![0.0, 0.0],
                channels: 1,
                sample_rate: 48_000,
            }),
            position: 0.0,
            start_frame: 0,
            end_frame: 2,
            volume: 1.0,
            looped: false,
        }
    }

    #[test]
    fn classifies_coreaudio_devices_when_the_backend_has_no_device_type() {
        assert!(matches!(
            infer_device_kind("BlackHole 2ch", DeviceDirection::Output),
            DeviceKind::Virtual
        ));
        assert!(matches!(
            infer_device_kind("MacBook Pro Speakers", DeviceDirection::Output),
            DeviceKind::Speaker
        ));
        assert!(matches!(
            infer_device_kind("MacBook Pro Microphone", DeviceDirection::Input),
            DeviceKind::Microphone
        ));
        assert!(matches!(
            infer_device_kind("Carl's AirPods", DeviceDirection::Output),
            DeviceKind::Headphones
        ));
    }

    #[test]
    fn repeated_overlap_only_ends_after_the_last_instance() {
        let mut state = BusState {
            voices: vec![voice(1, "clip"), voice(2, "clip")],
            ..BusState::default()
        };
        assert!(finish_voices(&mut state, &[(1, "clip".into())]).is_empty());
        assert_eq!(state.voices.len(), 1);
        assert_eq!(finish_voices(&mut state, &[(2, "clip".into())]), ["clip"]);
    }

    #[test]
    fn capture_buffer_resamples_between_device_rates() {
        let mut capture = CaptureBuffer {
            input_rate: 44_100,
            output_rate: 48_000,
            ..CaptureBuffer::default()
        };
        for _ in 0..4_410 {
            capture.push(0.5);
        }
        let output: Vec<_> = (0..2_400).map(|_| capture.next_resampled()).collect();
        assert!(output.iter().all(|sample| (*sample - 0.5).abs() < 0.001));
        assert!(capture.samples.len() > 1_900 && capture.samples.len() < 2_300);
    }

    #[test]
    fn trim_bounds_are_applied_in_seconds() {
        let audio = DecodedAudio {
            samples: vec![0.5; 48_000],
            channels: 1,
            sample_rate: 48_000,
        };
        assert_eq!(
            playback_bounds(&audio, 0.25, 0.5).unwrap(),
            (12_000, 24_000)
        );
        assert!(playback_bounds(&audio, 0.75, 0.25).is_err());
    }

    #[test]
    fn trim_edges_receive_click_safe_fades() {
        let mut voice = voice(1, "trimmed");
        voice.audio = Arc::new(DecodedAudio {
            samples: vec![1.0; 1_000],
            channels: 1,
            sample_rate: 1_000,
        });
        voice.start_frame = 100;
        voice.end_frame = 900;
        voice.position = 100.0;
        assert_eq!(sample_voice(&voice, 0), 0.0);
        voice.position = 500.0;
        assert_eq!(sample_voice(&voice, 0), 1.0);
        voice.position = 899.0;
        assert_eq!(sample_voice(&voice, 0), 0.0);
    }

    #[test]
    fn soft_limiter_preserves_safe_audio_and_contains_overlaps() {
        assert_eq!(soft_limit(0.5), 0.5);
        assert_eq!(soft_limit(-0.9), -0.9);
        assert!(soft_limit(2.0) > 0.9 && soft_limit(2.0) <= 1.0);
        assert!(soft_limit(-2.0) < -0.9 && soft_limit(-2.0) >= -1.0);
    }
}
