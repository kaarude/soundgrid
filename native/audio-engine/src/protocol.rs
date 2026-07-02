use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
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
    pub kind: DeviceKind,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceKind {
    Headphones,
    Headset,
    Speaker,
    Microphone,
    Virtual,
    Unknown,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
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

#[cfg(test)]
mod tests {
    use super::{BusName, Command, Event};

    #[test]
    fn accepts_renderer_camel_case_command_fields() {
        let command: Command = serde_json::from_str(
            r#"{"type":"play","bus":"mic","clipId":"clip","path":"clip.wav","volume":1,"looped":false}"#,
        )
        .unwrap();
        assert!(matches!(command, Command::Play { clip_id, .. } if clip_id == "clip"));
    }

    #[test]
    fn emits_renderer_camel_case_event_fields() {
        let event = serde_json::to_value(Event::ClipEnded {
            bus: BusName::Mic,
            clip_id: "clip".into(),
        })
        .unwrap();
        assert_eq!(event["clipId"], "clip");
        assert!(event.get("clip_id").is_none());
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BusName {
    Mic,
    Monitor,
}
