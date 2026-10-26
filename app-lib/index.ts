// @stellar-scaffold/app-lib — framework-agnostic chain and wallet layer, used by
// the React app in app/ and by the generated contract clients in
// app-lib/clients/index.ts. React code (providers, hooks, UI) stays in app/.

export * from "./env" // rpcUrl, networkPassphrase, allowHttp, stellarNetwork, network, labPrefix
export * from "./format" // shortAddress, formatNetworkName, networkStatus, NetworkState, errorMessage
export * from "./friendbot" // getFriendbotUrl
export * from "./game" // DrainMyWallet factory + $DRAIN XP calls, explorer links
export * from "./wallet" // connectWallet, disconnectWallet, profileModal, signTransaction, onWalletChange, fetchBalances, wallet, MappedBalances, WalletState
