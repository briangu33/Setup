#!/bin/bash
set -e
aws ecr describe-repositories --repository-names setup-mpc-server > /dev/null 2>&1 || aws ecr create-repository --repository-name setup-mpc-server
docker push 278380418400.dkr.ecr.eu-west-2.amazonaws.com/setup-mpc-server