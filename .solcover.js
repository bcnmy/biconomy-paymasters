module.exports = {
    configureYulOptimizer: true,
    skipFiles: [
    'common',
    'references',
    'test',
    'utils',
    'verifying',
    // 'token/oracles',
    // 'token/adapters',
    // 'token/feemanager'
  ],
  providerOptions: {
    default_balance_ether: 10000000000, // Extra zero, coverage consumes more gas
    network_id: 5777,
    mnemonic:
      'grocery obvious wire insane limit weather parade parrot patrol stock blast ivory',
    total_accounts: 30,
    allowUnlimitedContractSize: true,
  }
  };