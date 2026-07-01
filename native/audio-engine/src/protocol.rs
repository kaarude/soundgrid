use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Command {
    ListDevices,
    Configure {
        mic_output_device_id: Option<String>,
        monitor_device_id: Option<String>,
        real_mic_device_id: Option<String>,
        passthrough: bool,
        mic_volume: f32,
        monitor_volume: f32,
        overlap: MixMode,
    },
    Play {
        bus: Bus,
        clip_id: String,
        path: String,
        volume: f32,
        looped: bool,
    },
    Pause {
        bus: Bus,
    },
    Resume {
        bus: Bus,
    },
    Stop {
        bus: Bus,
    },
    StopAll,
    SetMute {
        bus: Bus,
        muted: bool,
    },
    SetVolume {
        bus: Bus,
        volume: f32,
    },
    Shutdown,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Bus {
    Mic,
    Monitor,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MixMode {
    Stop,
    Overlap,
    Queue,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub label: String,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Event {
    Ready,
    Devices {
        outputs: Vec<DeviceInfo>,
        inputs: Vec<DeviceInfo>,
    },
    Meter {
        mic: f32,
        monitor: f32,
    },
    ClipEnded {
        bus: BusName,
        clip_id: String,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BusName {
    Mic,
    Monitor,
}
