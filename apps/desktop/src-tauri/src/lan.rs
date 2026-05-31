//! LAN-side networking helpers shared across commands.
//!
//! Currently exposes [`detect_lan_ip`], used by the QR pairing command
//! (D4) and the tray's "Copy pairing URL" handler (E3). Keeps both
//! call sites on the exact same detection logic so a future
//! per-interface override only has to land here.

use std::net::{IpAddr, Ipv4Addr};

/// Substrings (case-insensitive) that mark a Windows network interface
/// as a virtual switch / tunnel / loopback rather than a physical LAN
/// link. Filtered out of [`detect_lan_ip`] candidates.
///
/// Sourced from observed names on a Hyper-V + WSL2 + Docker Desktop
/// host. Add new ones as they show up — the cost of a false-positive
/// skip is low (next candidate gets picked) and lower than the cost
/// of advertising e.g. a Hyper-V switch IP that phones cannot reach.
const VIRTUAL_INTERFACE_HINTS: &[&str] = &[
    "vethernet", // Hyper-V Virtual Ethernet (Default Switch / WSL)
    "hyper-v",
    "wsl",
    "docker",
    "vmware",
    "vbox",      // VirtualBox
    "virtualbox",
    "loopback",
    "tap-",      // OpenVPN TAP adapters
    "tun",       // OpenVPN TUN
];

/// Best-guess primary LAN IP of the host. Returns `None` if there is
/// no non-loopback, non-virtual IPv4 interface (e.g. unplugged
/// Ethernet + Wi-Fi off).
///
/// **Selection logic.** Enumerates all IPv4 interfaces, drops loopback
/// / link-local / virtual switches by name, then ranks the survivors:
///
/// 1. `192.168.x.x` — typical home/SOHO LAN (best score)
/// 2. `10.x.x.x` — corporate LAN
/// 3. `172.16.x.x` to `172.31.x.x` — RFC1918 but also Docker/Hyper-V
///    default range, so ranked below the others
/// 4. anything else (e.g. public-routed IP if no NAT) — last resort
///
/// Ties within the same rank go to whichever interface the OS listed
/// first — same as `local_ip_address::local_ip()` would have picked.
///
/// **Multi-interface caveat.** Even with this ranking, hosts with
/// multiple real LANs (Wi-Fi + Ethernet to different subnets) can have
/// the "wrong" one win. The pairing modal surfaces the picked URL
/// plainly so the user notices before scanning. A v2 follow-up could
/// expose all candidates as a dropdown — see PLAN-LAN-AND-TRAY.md
/// "LAN IP detection robustness".
pub fn detect_lan_ip() -> Option<IpAddr> {
    let netifas = local_ip_address::list_afinet_netifas().ok()?;

    let mut candidates: Vec<(String, Ipv4Addr)> = netifas
        .into_iter()
        .filter_map(|(name, ip)| match ip {
            IpAddr::V4(v4) => Some((name, v4)),
            // Phones in a typical home LAN don't advertise IPv6 to the
            // host, and the helper's listener binds 0.0.0.0 (v4 only).
            // IPv6 candidates can't be reached either way; drop them.
            IpAddr::V6(_) => None,
        })
        .filter(|(_, v4)| !v4.is_loopback() && !v4.is_link_local() && !v4.is_unspecified())
        .filter(|(name, _)| !is_virtual_interface(name))
        .collect();

    candidates.sort_by_key(|(_, v4)| rfc1918_priority(*v4));
    candidates.into_iter().next().map(|(_, v4)| IpAddr::V4(v4))
}

fn is_virtual_interface(name: &str) -> bool {
    let lower = name.to_lowercase();
    VIRTUAL_INTERFACE_HINTS
        .iter()
        .any(|hint| lower.contains(hint))
}

fn rfc1918_priority(v4: Ipv4Addr) -> u8 {
    match v4.octets() {
        [192, 168, _, _] => 0,
        [10, _, _, _] => 1,
        [172, b, _, _] if (16..=31).contains(&b) => 2,
        _ => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rfc1918_ranks_home_lan_first() {
        assert!(
            rfc1918_priority("192.168.0.199".parse().unwrap())
                < rfc1918_priority("172.18.0.1".parse().unwrap())
        );
        assert!(
            rfc1918_priority("10.0.0.5".parse().unwrap())
                < rfc1918_priority("172.20.10.1".parse().unwrap())
        );
        assert!(
            rfc1918_priority("172.16.5.5".parse().unwrap())
                < rfc1918_priority("8.8.8.8".parse().unwrap())
        );
    }

    #[test]
    fn virtual_interface_names_filtered() {
        // Real Windows + Hyper-V + WSL2 + Docker host samples.
        assert!(is_virtual_interface("vEthernet (Default Switch)"));
        assert!(is_virtual_interface("vEthernet (WSL (Hyper-V firewall))"));
        assert!(is_virtual_interface("Hyper-V Virtual Switch"));
        assert!(is_virtual_interface("Docker Desktop"));
        assert!(is_virtual_interface("VMware Network Adapter VMnet1"));
        assert!(is_virtual_interface("VirtualBox Host-Only Network"));
        assert!(is_virtual_interface("Loopback Pseudo-Interface 1"));
        // Physical interfaces stay.
        assert!(!is_virtual_interface("Wi-Fi"));
        assert!(!is_virtual_interface("Ethernet"));
        assert!(!is_virtual_interface("Ethernet 2"));
    }
}
