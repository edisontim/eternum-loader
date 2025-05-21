import { ConfigType } from "../types";

const ETERNUM_GITHUB_RAW_CONTENT_GAME_CONTRACTS_URL =
  "https://raw.githubusercontent.com/BibliothecaDAO/eternum/refs/heads/next/contracts/game/";

export const getToriiVersion = async () => {
  const response = await fetch(
    `${ETERNUM_GITHUB_RAW_CONTENT_GAME_CONTRACTS_URL}.tool-versions`
  );
  const data = await response.text();
  const toriiMatch = data.match(/torii\s+(\d+\.\d+\.\d+)/);
  const dojoTag = toriiMatch ? toriiMatch[1] : undefined;

  console.log(`Using torii version: ${dojoTag}`);
  return dojoTag;
};

export const getToriiConfig = async (configType: ConfigType) => {
  const url =
    configType === "mainnet"
      ? `${ETERNUM_GITHUB_RAW_CONTENT_GAME_CONTRACTS_URL}torii-mainnet-game.toml`
      : `${ETERNUM_GITHUB_RAW_CONTENT_GAME_CONTRACTS_URL}torii-${configType}.toml`;

  const response = await fetch(url);

  const data = await response.text();

  return data;
};
