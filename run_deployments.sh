#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Check if at least one network is provided
if [ $# -eq 0 ]; then
  echo "No networks provided. Usage: ./run_deployments.sh <network1> <network2> ..."
  exit 1
fi

# Define the environments
ENVIRONMENTS=("dev" "prod")

# Loop through each provided network argument
for NETWORK in "$@"
do
  # Loop through each environment and run deployments
  for ENV in "${ENVIRONMENTS[@]}"
  do
    echo "Running deployments on the $NETWORK network in $ENV mode..."

    # Set DEPLOYMENT_MODE for current environment
    export DEPLOYMENT_MODE=$ENV

    # Run your deployment scripts
    echo "Deploying Token Paymaster..."
    npx hardhat run --network $NETWORK scripts/1-deploy-token-paymaster.ts

    echo "Deploying Oracle Aggregator..."
    npx hardhat run --network $NETWORK scripts/2-deploy-oracle-aggregator.ts

    echo "Deploying Verifying Paymaster..."
    npx hardhat run --network $NETWORK scripts/8-deploy-verifying-paymaster.ts
  done
done
echo "All deployments completed!"