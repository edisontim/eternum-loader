import { CONFIG_TYPES, IpcMethod } from "../../types";
import { ButtonLike } from "../components/button-like";
import { Dropdown } from "../components/dropdown";
import { ProgressLogo } from "../components/progress-logo";
import { useAppContext } from "../context";
import { capitalize } from "../utils";

export const SyncingPage = () => {
  const { currentConfig, progress, setReset } = useAppContext();
  const { setShowWarning } = useAppContext();

  return (
    <div className="flex flex-col justify-center items-center gap-[10px]">
      <ProgressLogo />
      <div className="flex flex-col justify-center items-center gap-[10px] noselect">
        <div className="text-white text-base uppercase font-bold noselect">{`Eternum (${currentConfig?.configType}) is ${progress === 100 ? "synced" : "syncing"}`}</div>
      </div>
      <div className="w-fit h-fit flex flex-row gap-2">
        <Dropdown
          options={CONFIG_TYPES.filter(
            (config) => config !== currentConfig?.configType,
          ).map((config) => capitalize(config))}
          label={capitalize(currentConfig?.configType ?? CONFIG_TYPES[0])}
          selectCallback={(option: string) => {
            setShowWarning({
              callback: () => {
                console.log(`Setting config to: ${option}`);
                window.electronAPI.sendMessage(
                  IpcMethod.ChangeConfigType,
                  option.toLowerCase(),
                );
              },
              name: "switch chain",
              alertMessage: changeConfigTypeAlertMessage,
            });
          }}
        />
        <ButtonLike
          onClick={() => {
            setShowWarning({
              callback: () => {
                window.electronAPI.sendMessage(IpcMethod.KillTorii);
                setReset(true);
              },
              name: "restart",
              alertMessage: restartAlertMessage,
            });
          }}
          className="bg-deepRed hover:bg-deepRed/20"
        >
          <div>Restart</div>
        </ButtonLike>
      </div>
    </div>
  );
};

const changeConfigTypeAlertMessage =
  "This might corrupt the data of the current chain if you're still syncing.";

const restartAlertMessage = "This might corrupt the synced data.";
