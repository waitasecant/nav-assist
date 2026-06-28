import { useEffect, useState } from "react";
import Zeroconf from "react-native-zeroconf";

export interface DiscoveredHost {
  name: string;
  host: string;
}

export function useDiscovery(): DiscoveredHost[] {
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);

  useEffect(() => {
    let zc: Zeroconf;
    try {
      zc = new Zeroconf();
    } catch {
      // Native module unavailable (e.g. Expo Go without dev-client).
      return;
    }

    zc.on("resolved", (service) => {
      const addr = service.addresses?.[0] ?? service.host;
      if (!addr) return;
      setHosts((prev) =>
        prev.some((h) => h.name === service.name)
          ? prev
          : [...prev, { name: service.name, host: addr }]
      );
    });

    zc.on("removed", (service) => {
      setHosts((prev) => prev.filter((h) => h.name !== service.name));
    });

    zc.scan("navassist", "tcp", "local.");

    return () => {
      zc.stop();
      zc.removeAllListeners();
    };
  }, []);

  return hosts;
}
