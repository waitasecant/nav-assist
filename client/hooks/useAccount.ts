import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface Account {
  name: string;
  emergencyContact: string;
  onboardingComplete: boolean;
}

const DEFAULTS: Account = {
  name: "",
  emergencyContact: "",
  onboardingComplete: false,
};

const KEY = "navassist_account_v1";

export function useAccount() {
  const [account, setAccountState] = useState<Account>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((json) => {
      if (json) setAccountState({ ...DEFAULTS, ...JSON.parse(json) });
      setLoaded(true);
    });
  }, []);

  const setAccount = (patch: Partial<Account>) => {
    setAccountState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  };

  return { account, setAccount, loaded };
}
