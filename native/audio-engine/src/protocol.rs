use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Command {
    ListDevices {
        #[serde(default)]
        request_id: u64,
        #[serde(default = "default_true")]
        include_inputs: bool,
    },
    Configure {
        mic_output_device_id: Option<String>,
        monitor_device_id: Option<String>,
        real_mic_device_id: Option<String>,
        passthrough: bool,
        mic_volume: f32,
        monitor_volume: f32,
        monitor_enabled: bool,
        overlap: MixMode,
    },
    Play {
        bus: Bus,
        clip_id: String,
        path: String,
        volume: f32,
        #[serde(default)]
        trim_start: f32,
        #[serde(default)]
        trim_end: f32,
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

fn default_true() -> bool {
    true
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
        request_id: u64,
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
            r#"{"type":"play","bus":"mic","clipId":"clip","path":"clip.wav","volume":1,"trimStart":0.25,"trimEnd":0.5,"looped":false}"#,
        )
        .unwrap();
        assert!(matches!(
            command,
            Command::Play {
                clip_id,
                trim_start: 0.25,
                trim_end: 0.5,
                ..
            } if clip_id == "clip"
        ));
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

    #[test]
    fn accepts_monitor_enabled_in_configure_commands() {
        let command: Command = serde_json::from_str(
            r#"{"type":"configure","micOutputDeviceId":"cable","monitorDeviceId":null,"realMicDeviceId":null,"passthrough":false,"micVolume":1,"monitorVolume":1,"monitorEnabled":false,"overlap":"stop"}"#,
        )
        .unwrap();
        assert!(matches!(
            command,
            Command::Configure {
                monitor_enabled: false,
                ..
            }
        ));
    }

    #[test]
    fn device_listing_can_skip_permission_gated_inputs() {
        let outputs_only: Command =
            serde_json::from_str(r#"{"type":"listDevices","requestId":7,"includeInputs":false}"#)
                .unwrap();
        assert!(matches!(
            outputs_only,
            Command::ListDevices {
                request_id: 7,
                include_inputs: false
            }
        ));

        let backwards_compatible: Command =
            serde_json::from_str(r#"{"type":"listDevices"}"#).unwrap();
        assert!(matches!(
            backwards_compatible,
            Command::ListDevices {
                request_id: 0,
                include_inputs: true
            }
        ));
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BusName {
    Mic,
    Monitor,
}
