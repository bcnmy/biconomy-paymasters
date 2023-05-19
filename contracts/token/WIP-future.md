// versionss of BiconomyTokenPaymaster

i. fully permissionless - remove verifying signer, sending exchange rate from backend, make entries for allowed tokens, touch price feeds in postop, in validation stage check enough balance (with fixed cost? / cached exchange rate)

ii. hybrid - let it act as gasless + token paymaster by managing dapp deposits with paymasterId and only using them based on if fee token is passed 0 address

iii. user facing deposit paymaster which could actually act as user gas tank.

iv. dapp owned paymaster with ability to add tokens, add feeds, change fee receiver, change markup etc and verifying signer could be optional - needs a factory

v. partial gas sponsorship with fee rebates in actual tokens to be charged. needs to maintain paymasterIdBalances. 
