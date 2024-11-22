import Client, {
  CommitmentLevel,
  SubscribeRequest,
} from "./wrappers/yellowstone-wrapper.js";
import bs58 from "bs58";
import { Connection, PublicKey } from "@solana/web3.js";
import WebSocket from "ws";
import chalk from "chalk";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const GRPC_URL = process.env.GRPC_URL as string;
const HTTP_URL = process.env.HTTP_URL as string;
const WS_URL = process.env.WS_URL as string;
const TEST_DURATION = Number(process.env.TEST_DURATION as string);
const TEST_INTERVAL = Number(process.env.TEST_INTERVAL as string);

const checkEnvVariables = () => {
  const missingVars = [];
  if (!GRPC_URL) missingVars.push("GRPC_URL");
  if (!HTTP_URL) missingVars.push("HTTP_URL");
  if (!WS_URL) missingVars.push("WS_URL");
  if (!TEST_DURATION) missingVars.push("TEST_DURATION");
  if (!TEST_INTERVAL) missingVars.push("TEST_INTERVAL");

  if (missingVars.length > 0) {
    console.log(chalk.red(`Missing environment variable(s): ${missingVars.join(", ")}`));
    process.exit(1);
  }
};

checkEnvVariables();

const COMMITMENT_LEVEL = "confirmed";
const X_TOKEN = undefined;
const PING_INTERVAL_MS = 30_000; // 30s
const COPY_ACCOUNTS = ["SysvarC1ock11111111111111111111111111111111"];

const CONNECTION_HTTP = new Connection(HTTP_URL, {
  commitment: COMMITMENT_LEVEL,
});

export interface IResults {
  time: string;
  count: number;
}

function formatElapsedTime(seconds: number) {
  const units = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "week", seconds: 604800 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 },
    { label: "second", seconds: 1 },
  ];

  let remainingSeconds = seconds;
  const parts: string[] = [];

  for (const unit of units) {
    if (remainingSeconds >= unit.seconds) {
      const value = Math.floor(remainingSeconds / unit.seconds);
      remainingSeconds %= unit.seconds;
      parts.push(`${value} ${unit.label}${value !== 1 ? "s" : ""}`);
    }
  }

  return parts.join(", ");
}

async function testGrpcStream(): Promise<IResults> {
  let elapsedTime = "0";
  let dataDetectedCount = 0;

  const client = new Client(GRPC_URL, X_TOKEN, {});

  const stream = await client.subscribe();

  const startTime = Date.now();

  const pingRequest: SubscribeRequest = {
    ping: { id: 1 },
    accounts: {},
    accountsDataSlice: [],
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    slots: {},
  };

  const pingInterval = setInterval(async () => {
    await new Promise<void>((resolve, reject) => {
      stream.write(pingRequest, (err: any) => {
        if (err === null || err === undefined) {
          resolve();
        } else {
          reject(err);
        }
      });
    }).catch((reason) => {
      console.error(reason);
      throw reason;
    });
  }, PING_INTERVAL_MS);

  const streamClosed = new Promise<void>((resolve, reject) => {
    stream.on("error", (error) => {
      reject(error);
      stream.end();
    });
    stream.on("end", () => {
      clearInterval(pingInterval);
      resolve();
    });
    stream.on("close", () => {
      clearInterval(pingInterval);
      resolve();
    });
  });

  stream.on("data", async (data) => {
    const ts = Date.now();
    const elapsed = Math.floor((ts - startTime) / 1000);
    elapsedTime = formatElapsedTime(elapsed);

    if (data.filters[0] === "txReq") {
      const accKeysBytes =
        data.transaction.transaction.transaction.message.accountKeys;
      const accountKeys = accKeysBytes.map((key: any) => bs58.encode(key));
      const txSig = bs58.encode(data.transaction.transaction.signature);
      let matchingAccount = "";

      accountKeys.forEach((account: any) => {
        if (COPY_ACCOUNTS.includes(account)) {
          dataDetectedCount += 1;
          console.log(
            `\n${new Date(ts).toUTCString()}: Matching account detected from gRPC connection!`
          );
          matchingAccount = account;
          console.log(
            `${new Date(ts).toUTCString()}: Account: ${matchingAccount}`
          );
          console.log(`${new Date(ts).toUTCString()}: Signature: ${txSig}`);
          console.log(
            `${new Date(ts).toUTCString()}: gRPC stream active for: ${elapsedTime}`
          );
          console.log(
            `${new Date(ts).toUTCString()}: gRPC data detected count: ${dataDetectedCount}\n`
          );
        }
      });
    } else if (data.pong) {
      console.log(`${new Date(ts).toUTCString()}: Processed ping response!`);
    }
  });

  const accountRequest: SubscribeRequest = {
    slots: {},
    commitment: CommitmentLevel.CONFIRMED,
    accounts: {},
    accountsDataSlice: [],
    transactions: {
      txReq: {
        vote: undefined,
        failed: undefined,
        signature: undefined,
        accountInclude: COPY_ACCOUNTS,
        accountExclude: {},
        accountRequired: {},
      },
    },
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
  };

  await new Promise<void>((resolve, reject) => {
    stream.write(accountRequest, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error(reason);
    throw reason;
  });

  return new Promise<IResults>((resolve) => {
    setTimeout(() => {
      stream
        .removeAllListeners()
        .once("error", () => {
          resolve({ time: elapsedTime, count: dataDetectedCount });
        })
        .cancel();
    }, TEST_DURATION * 1000);
  });
}

async function testGrpcCalls() {
  const startTime = Date.now();
  let callsMade = 0;
  const client = new Client(GRPC_URL, X_TOKEN, {});

  while (true) {
    const ts = Date.now();
    const elapsed = Math.floor((ts - startTime) / 1000);
    const elapsedTime = formatElapsedTime(elapsed);

    if (TEST_DURATION > 0) {
      if (elapsed > TEST_DURATION) {
        return { time: elapsedTime, count: callsMade };
      }
    }

    try {
      const latestBlockhash = await client.getLatestBlockhash();
      callsMade += 1;

      console.log(
        `\n${new Date(ts).toUTCString()}: Latest blockhash received from gRPC call!`
      );
      console.log(
        `${new Date(ts).toUTCString()}: Latest blockhash from chain: ${latestBlockhash.blockhash}`
      );
      console.log(
        `${new Date(ts).toUTCString()}: gRPC calls active for: ${elapsedTime}`
      );
      console.log(
        `${new Date(ts).toUTCString()}: gRPC calls consecutively made: ${callsMade}\n`
      );
    } catch (error) {
      callsMade = 0;
      console.error(`HTTP Error: ${error}`);
    }
  }
}

async function testWebSocketStream(): Promise<IResults> {
  let elapsedTime = "0";
  let dataDetectedCount = 0;

  const ws = new WebSocket(WS_URL);
  let websocketInitialize = true;

  let startTime: number;

  ws.on("open", () => {
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "logsSubscribe",
      params: [{ mentions: COPY_ACCOUNTS }, { commitment: "finalized" }],
    };

    ws.send(JSON.stringify(request));
    console.log("\nWebSocket connection opened and subscription request sent");
  });

  ws.on("message", (message) => {
    try {
      const responseDict = JSON.parse(message.toString());

      if ("result" in responseDict) {
        if (websocketInitialize) {
          websocketInitialize = false;
          console.log("WebSocket initialized\n");
          startTime = Date.now();
        }
      }

      if (responseDict.params?.result?.value?.err === null) {
        const ts = Date.now();
        const elapsed = Math.floor((ts - startTime) / 1000);
        elapsedTime = formatElapsedTime(elapsed);
        const txSig = responseDict.params.result.value.signature;
        dataDetectedCount += 1;
        console.log(
          `${new Date(ts).toUTCString()}: Matching account detected from WEBSOCKET connection!`
        );
        console.log(
          `${new Date(ts).toUTCString()}: Account: ${COPY_ACCOUNTS[0]}`
        );
        console.log(`${new Date(ts).toUTCString()}: Signature: ${txSig}`);
        console.log(
          `${new Date(ts).toUTCString()}: WebSocket stream active for: ${elapsedTime}`
        );
        console.log(
          `${new Date(ts).toUTCString()}: WebSocket data detected count: ${dataDetectedCount}\n`
        );
      } else {
        if (responseDict.params?.result?.value?.err) {
          console.warn("Error in detected transaction... Skipping processing");
        }
      }
    } catch (error) {
      console.error("Error processing WebSocket message:", error);
    }
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });

  ws.on("close", (code, reason) => {
    ws.removeAllListeners();
    console.log(`WebSocket connection closed (code ${code}): ${reason}`);
  });

  return new Promise<IResults>((resolve) => {
    setTimeout(() => {
      ws.close();
      ws.removeAllListeners();
      resolve({ time: elapsedTime, count: dataDetectedCount });
    }, TEST_DURATION * 1000);
  });
}

async function testHttpCalls() {
  const startTime = Date.now();
  let callsMade = 0;

  while (true) {
    const ts = Date.now();
    const elapsed = Math.floor((ts - startTime) / 1000);
    const elapsedTime = formatElapsedTime(elapsed);

    if (TEST_DURATION > 0) {
      if (elapsed > TEST_DURATION) {
        return { time: elapsedTime, count: callsMade };
      }
    }

    try {
      const sigsForAccount = await CONNECTION_HTTP.getSignaturesForAddress(
        new PublicKey(COPY_ACCOUNTS[0])
      );
      const latestAccountTx = sigsForAccount[0].signature;
      callsMade += 1;

      console.log(
        `\n${new Date(ts).toUTCString()}: Signatures for first copy account received from HTTP call!`
      );
      console.log(
        `${new Date(ts).toUTCString()}: Account: ${COPY_ACCOUNTS[0]}`
      );
      console.log(
        `${new Date(ts).toUTCString()}: Latest Signature from Account: ${latestAccountTx}`
      );
      console.log(
        `${new Date(ts).toUTCString()}: HTTP calls active for: ${elapsedTime}`
      );
      console.log(
        `${new Date(ts).toUTCString()}: HTTP calls consecutively made: ${callsMade}\n`
      );
    } catch (error) {
      callsMade = 0;
      console.error(`HTTP Error: ${error}`);
    }
  }
}

async function runTests() {
  console.log(chalk.bold.yellow("\nConfiguration:\n"));
  console.log(chalk.yellow(`gRPC URL: ${GRPC_URL}`));
  console.log(chalk.yellow(`HTTP URL: ${HTTP_URL}`));
  console.log(chalk.yellow(`WebSocket URL: ${WS_URL}`));
  console.log(chalk.yellow(`Test Duration: ${TEST_DURATION} seconds`));
  console.log(chalk.yellow(`Test Interval: ${TEST_INTERVAL} seconds\n`));

  const countdownInPlace = (message: string): Promise<void> => {
    return new Promise((resolve) => {
      let countdown = TEST_INTERVAL;
      const countdownInterval = setInterval(() => {
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(chalk.blue(`${message} in ${countdown}s...`));
        countdown--;

        if (countdown < 0) {
          clearInterval(countdownInterval);
          process.stdout.write("\n"); // Move to the next line after countdown
          resolve();
        }
      }, 1000);
    });
  };

  // gRPC Stream Test
  let gRpcStreamResults: IResults = { time: "0", count: 0 };
  await countdownInPlace("Starting gRPC Stream test");
  gRpcStreamResults = await testGrpcStream();
  console.log(chalk.green(`gRPC Stream test completed!\n`));

  // gRPC Calls Test
  let gRpcCallResults: IResults = { time: "0", count: 0 };
  await countdownInPlace("Starting gRPC Calls test");
  gRpcCallResults = await testGrpcCalls();
  console.log(chalk.green(`gRPC Calls test completed!\n`));

  // WebSocket Stream Test
  let websocketStreamResults: IResults = { time: "0", count: 0 };
  await countdownInPlace("Starting WebSocket Stream test");
  websocketStreamResults = await testWebSocketStream();
  console.log(chalk.green(`WebSocket Stream test completed!\n`));

  // HTTP Calls Test
  let httpCallResults: IResults = { time: "0", count: 0 };
  await countdownInPlace("Starting HTTP Calls test");
  httpCallResults = await testHttpCalls();
  console.log(chalk.green(`HTTP Calls test completed!\n`));

  console.log(chalk.bold(`Test Results:\n`));

  console.log(chalk.cyan(`gRPC Stream Results:`));
  console.log(`Run Time: ${gRpcStreamResults.time}`);
  console.log(`Data Count: ${gRpcStreamResults.count}\n`);

  console.log(chalk.cyan(`gRPC Call Results:`));
  console.log(`Run Time: ${gRpcCallResults.time}`);
  console.log(`Data Count: ${gRpcCallResults.count}\n`);

  console.log(chalk.cyan(`WebSocket Stream Results:`));
  console.log(`Run Time: ${websocketStreamResults.time}`);
  console.log(`Data Count: ${websocketStreamResults.count}\n`);

  console.log(chalk.cyan(`HTTP Call Results:`));
  console.log(`Run Time: ${httpCallResults.time}`);
  console.log(`Data Count: ${httpCallResults.count}\n`);

  console.log(chalk.bold.yellow(`Configuration used in tests:\n`));
  console.log(chalk.yellow(`gRPC URL: ${GRPC_URL}`));
  console.log(chalk.yellow(`HTTP URL: ${HTTP_URL}`));
  console.log(chalk.yellow(`WebSocket URL: ${WS_URL}`));
  console.log(chalk.yellow(`Test Duration: ${TEST_DURATION} seconds`));
  console.log(chalk.yellow(`Test Interval: ${TEST_INTERVAL} seconds\n`));
}

runTests();
