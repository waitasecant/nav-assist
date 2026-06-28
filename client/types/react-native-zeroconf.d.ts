declare module "react-native-zeroconf" {
  export interface ZeroconfService {
    name: string;
    fullName: string;
    host: string;
    addresses: string[];
    port: number;
    txt: Record<string, string>;
  }

  export default class Zeroconf {
    scan(type?: string, protocol?: string, domain?: string): void;
    stop(): void;
    removeAllListeners(): void;
    on(event: "resolved", cb: (service: ZeroconfService) => void): void;
    on(event: "removed", cb: (service: Pick<ZeroconfService, "name">) => void): void;
    on(event: "error", cb: (err: Error) => void): void;
  }
}
