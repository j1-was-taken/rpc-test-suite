import {
  CommitmentLevel,
  GetLatestBlockhashResponse,
  GeyserClient,
  IsBlockhashValidResponse,
  SubscribeRequestAccountsDataSlice,
  SubscribeRequestFilterAccounts,
  SubscribeRequestFilterBlocks,
  SubscribeRequestFilterBlocksMeta,
  SubscribeRequestFilterEntry,
  SubscribeRequestFilterSlots,
  SubscribeRequestFilterTransactions,
} from "@triton-one/yellowstone-grpc";

import { ChannelOptions } from "@grpc/grpc-js";

export {
  CommitmentLevel,
  SubscribeRequest,
  SubscribeRequestAccountsDataSlice,
  SubscribeRequestFilterAccounts,
  SubscribeRequestFilterAccountsFilter,
  SubscribeRequestFilterAccountsFilterMemcmp,
  SubscribeRequestFilterBlocks,
  SubscribeRequestFilterBlocksMeta,
  SubscribeRequestFilterEntry,
  SubscribeRequestFilterSlots,
  SubscribeRequestFilterTransactions,
  SubscribeRequest_AccountsEntry,
  SubscribeRequest_BlocksEntry,
  SubscribeRequest_BlocksMetaEntry,
  SubscribeRequest_SlotsEntry,
  SubscribeRequest_TransactionsEntry,
  SubscribeUpdate,
  SubscribeUpdateAccount,
  SubscribeUpdateAccountInfo,
  SubscribeUpdateBlock,
  SubscribeUpdateBlockMeta,
  SubscribeUpdatePing,
  SubscribeUpdateSlot,
  SubscribeUpdateTransaction,
  SubscribeUpdateTransactionInfo,
};

export default class Client {
  _client: GeyserClient;
  _insecureXToken: string | undefined;
  constructor(
    endpoint: string,
    xToken: string | undefined,
    channelOptions: ChannelOptions | undefined
  );
  private _getInsecureMetadata;
  subscribe(): Promise<
    import("@grpc/grpc-js").ClientDuplexStream<
      SubscribeRequest,
      SubscribeUpdate
    >
  >;
  subscribeOnce(
    accounts: { [key: string]: SubscribeRequestFilterAccounts },
    slots: { [key: string]: SubscribeRequestFilterSlots },
    transactions: { [key: string]: SubscribeRequestFilterTransactions },
    transactionsStatus: { [key: string]: SubscribeRequestFilterTransactions },
    entry: { [key: string]: SubscribeRequestFilterEntry },
    blocks: { [key: string]: SubscribeRequestFilterBlocks },
    blocksMeta: { [key: string]: SubscribeRequestFilterBlocksMeta },
    commitment: CommitmentLevel | undefined,
    accountsDataSlice: SubscribeRequestAccountsDataSlice[]
  ): Promise<
    import("@grpc/grpc-js").ClientDuplexStream<
      SubscribeRequest,
      SubscribeUpdate
    >
  >;
  ping(count: number): Promise<number>;
  getLatestBlockhash(
    commitment?: CommitmentLevel
  ): Promise<GetLatestBlockhashResponse>;
  getBlockHeight(commitment?: CommitmentLevel): Promise<string>;
  getSlot(commitment?: CommitmentLevel): Promise<string>;
  isBlockhashValid(
    blockhash: string,
    commitment?: CommitmentLevel
  ): Promise<IsBlockhashValidResponse>;
  getVersion(): Promise<string>;
}
