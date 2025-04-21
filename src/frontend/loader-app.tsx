import cover1 from "@public/covers/01.png";
import cover02 from "@public/covers/02.png";
import cover03 from "@public/covers/03.png";
import cover04 from "@public/covers/04.png";
import cover05 from "@public/covers/05.png";
import cover06 from "@public/covers/06.png";
import cover07 from "@public/covers/07.png";

// import Refresh from "@public/icons/refresh.svg?react";
import { IpcRendererEvent } from "electron";
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { IpcMethod, ToriiConfig } from "../types";
import { DeleteButton } from "./components/delete";
import { Logs } from "./components/logs";
import { Warning } from "./components/warning";
import { Page, useAppContext } from "./context";
import { useProgress } from "./hooks/use-progress";
import { StartPage } from "./pages/start-page";
import { SyncingPage } from "./pages/syncing-page";

const DraggableArea = styled.div`
  -webkit-app-region: drag;
  width: 100vw;
  min-height: 30px;
  position: relative;
  top: 0;
  left: 0;
  right: 0;
  z-index: 999;
  padding: 4px 6px 4px 6px;
`;

const ClickableArea = styled.div`
  -webkit-app-region: no-drag;
`;

export const LoaderApp = () => {
  const {
    setCurrentConfig,
    page,
    setPage,
    progress,
    reset,
    setProgress,
    setReset,
  } = useAppContext();
  const [version, setVersion] = useState<string | null>(null);

  useProgress();

  useEffect(() => {
    if (reset) {
      setProgress(0);
      setReset(false);
    }
  }, [reset, setProgress, setReset]);

  const backgroundImage = useMemo(() => {
    const img = getRandomBackgroundImage();
    return img;
  }, []);

  useEffect(() => {
    const removeListener = window.electronAPI.onConfigChanged(
      (config: ToriiConfig) => {
        console.log("config changed", config);
        setCurrentConfig(config);
      },
    );
    return () => {
      removeListener();
    };
  }, []);
  useEffect(() => {
    const removeListener = window.electronAPI.on(
      IpcMethod.VersionNotification,
      (event: IpcRendererEvent, version: string) => {
        setVersion(version);
      },
    );
    return () => {
      removeListener();
    };
  }, []);

  useEffect(() => {
    const removeListener = window.electronAPI.on(
      IpcMethod.PageNotification,
      (_: IpcRendererEvent, page: Page) => {
        setPage(page);
      },
    );
    return () => {
      removeListener();
    };
  }, []);

  return (
    <>
      <img
        className="z-1 absolute h-screen w-screen object-cover"
        src={`${backgroundImage}`}
        alt="Cover"
      />
      <div className="relative top-0 left-0 right-0 bottom-0 w-[100vw] h-[100vh] overflow-hidden flex flex-col justify-center items-center z-20">
        <DraggableArea className="h-fit flex flex-row justify-between items-center">
          <div className="flex flex-row h-full w-fit gap-2">
            <div className="text-white text-xs">Eternum Loader</div>
            {version && <div className="text-white/40 text-xs">v{version}</div>}
          </div>
          {page === Page.Syncing && (
            <ClickableArea className="flex flex-row gap-4 items-center justify-center">
              <DeleteButton />
              <div className="text-white text-xs select-none">
                {Math.ceil(progress)}%
              </div>
            </ClickableArea>
          )}
        </DraggableArea>

        <div className="relative flex flex-col h-full justify-center items-center transition-all duration-300 ease-in-out">
          {page === Page.Start ? (
            <StartPage />
          ) : page === Page.Syncing ? (
            <SyncingPage />
          ) : (
            <img
              className="w-[84px]"
              src={"./public/eternum-loader.png"}
              alt="Loading"
            />
          )}
        </div>
        <Warning />
        <Logs />
      </div>
    </>
  );
};

export const getRandomBackgroundImage = () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const imageNumber = (timestamp % 7) + 1;

  switch (imageNumber) {
    case 1:
      return cover1;
    case 2:
      return cover02;
    case 3:
      return cover03;
    case 4:
      return cover04;
    case 5:
      return cover05;
    case 6:
      return cover06;
    case 7:
      return cover07;
    default:
      return cover1;
  }
};
