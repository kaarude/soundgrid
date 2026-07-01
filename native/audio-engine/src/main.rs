mod decoder;
mod protocol;

use anyhow::{Context, Result};
use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Device, FromSample, Sample, SampleFormat, SizedSample, Stream, StreamConfig,
};
use decoder::DecodedAudio;
use protocol::{Bus, BusName, Command, DeviceInfo, Event, MixMode};
use std::{
    collections::VecDeque,
    io::{self, BufRead, Write},
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        mpsc::{self, SyncSender},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

struct Voice {
    id: String,
    audio: Arc<DecodedAudio>,
    position: f64,
    volume: f32,
    looped: bool,
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
    capture: Arc<Mutex<VecDeque<f32>>>,
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
            capture: Arc::new(Mutex::new(VecDeque::new())),
            mic_meter: Arc::new(AtomicU32::new(0)),
            monitor_meter: Arc::new(AtomicU32::new(0)),
            mic_stream: None,
            monitor_stream: None,
            capture_stream: None,
            ended_tx,
        }
    }

    fn devices(&self) -> Result<(Vec<DeviceInfo>, Vec<DeviceInfo>)> {
        Ok((
            enumerate(
                self.host
                    .output_devices()
                    .context("cannot enumerate output devices")?,
            )?,
            enumerate(
                self.host
                    .input_devices()
                    .context("cannot enumerate input devices")?,
            )?,
        ))
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
        overlap: MixMode,
    ) -> Result<()> {
        self.mic_stream = None;
        self.monitor_stream = None;
        self.capture_stream = None;
        self.capture.lock().expect("capture mutex poisoned").clear();

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

        let mic_device = select_output(&self.host, mic_output_id.as_deref())?
            .context("no mic-output playback device is available")?;
        let monitor_device = select_output(&self.host, monitor_id.as_deref())?
            .context("no monitor playback device is available")?;

        self.mic_stream = Some(build_output(
            &mic_device,
            self.mic.clone(),
            Some(self.capture.clone()),
            self.mic_meter.clone(),
            BusName::Mic,
            self.ended_tx.clone(),
        )?);
        self.monitor_stream = Some(build_output(
            &monitor_device,
            self.monitor.clone(),
            None,
            self.monitor_meter.clone(),
            BusName::Monitor,
            self.ended_tx.clone(),
        )?);

        if passthrough {
            if let Some(input) = select_input(&self.host, real_mic_id.as_deref())? {
                self.capture_stream = Some(build_input(&input, self.capture.clone())?);
            }
        }

        self.mic_stream
            .as_ref()
            .unwrap()
            .play()
            .context("cannot start mic output")?;
        self.monitor_stream
            .as_ref()
            .unwrap()
            .play()
            .context("cannot start monitor output")?;
        if let Some(stream) = &self.capture_stream {
            stream.play().context("cannot start microphone capture")?;
        }
        Ok(())
    }

    fn play(&self, bus: Bus, id: String, path: String, volume: f32, looped: bool) -> Result<()> {
        let audio = Arc::new(decoder::decode(&path)?);
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
            id,
            audio,
            position: 0.0,
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
        Command::ListDevices => {
            let (outputs, inputs) = engine.devices()?;
            emit(&Event::Devices { outputs, inputs });
        }
        Command::Configure {
            mic_output_device_id,
            monitor_device_id,
            real_mic_device_id,
            passthrough,
            mic_volume,
            monitor_volume,
            overlap,
        } => engine.configure(
            mic_output_device_id,
            monitor_device_id,
            real_mic_device_id,
            passthrough,
            mic_volume,
            monitor_volume,
            overlap,
        )?,
        Command::Play {
            bus,
            clip_id,
            path,
            volume,
            looped,
        } => engine.play(bus, clip_id, path, volume, looped)?,
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

fn enumerate(devices: impl Iterator<Item = Device>) -> Result<Vec<DeviceInfo>> {
    devices
        .enumerate()
        .map(|(index, device)| {
            let label = device.name().context("cannot read audio device name")?;
            Ok(DeviceInfo {
                id: format!("{index}:{label}"),
                label,
            })
        })
        .collect()
}

fn select_output(host: &cpal::Host, id: Option<&str>) -> Result<Option<Device>> {
    select(
        host.output_devices()
            .context("cannot enumerate output devices")?,
        id,
    )
    .map(|device| device.or_else(|| host.default_output_device()))
}

fn select_input(host: &cpal::Host, id: Option<&str>) -> Result<Option<Device>> {
    select(
        host.input_devices()
            .context("cannot enumerate input devices")?,
        id,
    )
    .map(|device| device.or_else(|| host.default_input_device()))
}

fn select(devices: impl Iterator<Item = Device>, id: Option<&str>) -> Result<Option<Device>> {
    let Some(id) = id else { return Ok(None) };
    for (index, device) in devices.enumerate() {
        let label = device.name().context("cannot read audio device name")?;
        if format!("{index}:{label}") == id {
            return Ok(Some(device));
        }
    }
    Ok(None)
}

fn build_output(
    device: &Device,
    state: Arc<Mutex<BusState>>,
    capture: Option<Arc<Mutex<VecDeque<f32>>>>,
    meter: Arc<AtomicU32>,
    bus: BusName,
    ended_tx: SyncSender<(BusName, String)>,
) -> Result<Stream> {
    let supported = device
        .default_output_config()
        .context("no supported output format")?;
    let config: StreamConfig = supported.clone().into();
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
    capture: Option<Arc<Mutex<VecDeque<f32>>>>,
    meter: Arc<AtomicU32>,
    bus: BusName,
    ended_tx: SyncSender<(BusName, String)>,
) -> Result<Stream>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = config.channels as usize;
    let sample_rate = config.sample_rate.0;
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
                let mut finished = Vec::new();
                let mut capture = capture
                    .as_ref()
                    .map(|buffer| buffer.lock().expect("capture mutex poisoned"));

                for frame in output.chunks_mut(channels) {
                    let passthrough = capture
                        .as_mut()
                        .and_then(|buffer| buffer.pop_front())
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
                        value = (value * gain).clamp(-1.0, 1.0);
                        peak = peak.max(value.abs());
                        *sample = T::from_sample(value);
                    }
                    if !paused {
                        for (voice_index, voice) in state.voices.iter_mut().enumerate() {
                            if queue_mode && voice_index > 0 {
                                break;
                            }
                            voice.position += voice.audio.sample_rate as f64 / sample_rate as f64;
                            let frame_count = voice.audio.samples.len() / voice.audio.channels;
                            if voice.position >= frame_count as f64 {
                                if voice.looped {
                                    voice.position %= frame_count as f64;
                                } else {
                                    finished.push(voice.id.clone());
                                }
                            }
                        }
                        if !finished.is_empty() {
                            state.voices.retain(|voice| !finished.contains(&voice.id));
                        }
                    }
                }
                meter.fetch_max(peak.to_bits(), Ordering::Relaxed);
                for id in finished {
                    let _ = ended_tx.try_send((bus, id));
                }
            },
            move |error| emit_error(format!("{error_bus} output stream failed: {error}")),
            None,
        )
        .context("cannot create output stream")
}

fn sample_voice(voice: &Voice, output_channel: usize) -> f32 {
    let frames = voice.audio.samples.len() / voice.audio.channels;
    if frames == 0 {
        return 0.0;
    }
    let frame = (voice.position.floor() as usize).min(frames - 1);
    let next = (frame + 1).min(frames - 1);
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
    let from_start = voice.position as usize;
    let to_end = frames.saturating_sub(from_start + 1);
    let envelope = if voice.looped {
        (from_start.min(fade_frames) as f32 / fade_frames as f32).min(1.0)
    } else {
        (from_start.min(to_end).min(fade_frames) as f32 / fade_frames as f32)
            .min(1.0)
    };
    interpolated * envelope
}

fn build_input(device: &Device, capture: Arc<Mutex<VecDeque<f32>>>) -> Result<Stream> {
    let supported = device
        .default_input_config()
        .context("no supported input format")?;
    let config: StreamConfig = supported.clone().into();
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
    capture: Arc<Mutex<VecDeque<f32>>>,
) -> Result<Stream>
where
    T: SizedSample + Sample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    let capacity = config.sample_rate.0 as usize * 2;
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
                    buffer.push_back(mono);
                }
                while buffer.len() > capacity {
                    buffer.pop_front();
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
