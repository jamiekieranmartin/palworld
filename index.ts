import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { readFileSync } from "fs";

import {
  GCP_ORG_ID,
  GCP_BILLING_ACCOUNT,
  ADMIN_PASSWORD,
  SERVER_PASSWORD,
} from "./environment";

const stack = pulumi.getStack();

const projectId = new pulumi.Config("gcp").require("project");
const projectName = `${stack}-project`;
const project = new gcp.organizations.Project(projectName, {
  orgId: GCP_ORG_ID,
  billingAccount: GCP_BILLING_ACCOUNT,
  projectId,
  name: projectName,
});

const computeService = new gcp.projects.Service(
  `${stack}-compute-service`,
  {
    project: project.projectId,
    service: "compute.googleapis.com",
  },
  {
    dependsOn: [project],
  }
);

const networkName = `${stack}-network`;
const network = new gcp.compute.Network(
  networkName,
  {
    project: project.projectId,
    name: networkName,
  },
  {
    dependsOn: [computeService, project],
  }
);

const firewallName = `${stack}-firewall`;
new gcp.compute.Firewall(
  firewallName,
  {
    project: project.projectId,
    network: network.id,
    name: firewallName,
    allows: [
      {
        protocol: "tcp",
        ports: ["22"],
      },
      {
        protocol: "udp",
        ports: ["8211"],
      },
      {
        protocol: "tcp",
        ports: ["8212"],
      },
      {
        protocol: "udp",
        ports: ["27015"],
      },
    ],
    sourceRanges: ["0.0.0.0/0"],
  },
  {
    dependsOn: [network],
  }
);

const diskConfig = new pulumi.Config("disk");

const diskName = `${stack}-disk`;
const disk = new gcp.compute.Disk(
  diskName,
  {
    project: project.projectId,
    name: diskName,
    size: diskConfig.requireNumber("sizeGb"),
    type: diskConfig.require("type"),
    image: diskConfig.require("image"),
  },
  {
    dependsOn: [computeService],
  }
);

const deviceName = disk.name;

const staticIpName = `${stack}-static-ip`;
const staticIp = new gcp.compute.Address(
  staticIpName,
  {
    project: project.projectId,
    name: staticIpName,
    networkTier: "STANDARD",
  },
  {
    dependsOn: [computeService],
  }
);

const prometheusYml = readFileSync("palworld/prometheus.yml", "utf8");
const grafanaDatasourceYml = readFileSync(
  "palworld/grafana-datasource.yml",
  "utf8"
);
const dockerComposeYml = readFileSync("palworld/docker-compose.yml", "utf8")
  .replace(/#ADMIN_PASSWORD/g, ADMIN_PASSWORD)
  .replace(/#SERVER_PASSWORD/g, SERVER_PASSWORD);

const instanceConfig = new pulumi.Config("server");
const instanceName = `${stack}-instance`;
const instanceMachineType = instanceConfig.require("machineType");
const instanceDesiredStatus = instanceConfig.requireBoolean("running")
  ? "RUNNING"
  : "TERMINATED";
const instance = new gcp.compute.Instance(
  instanceName,
  {
    project: project.projectId,
    name: instanceName,
    machineType: instanceMachineType,
    bootDisk: {
      autoDelete: false,
      source: disk.selfLink,
      deviceName,
    },
    desiredStatus: instanceDesiredStatus,
    networkInterfaces: [
      {
        network: network.id,
        accessConfigs: [
          {
            natIp: staticIp.address,
            networkTier: "STANDARD",
          },
        ],
      },
    ],
    metadataStartupScript: pulumi.interpolate`#!/bin/bash
# Add Docker's official GPG key:
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
echo \
 "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian \
 $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
 sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update

sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

mkdir palworld
sudo chmod -R a+rwx palworld

cd palworld

echo "${prometheusYml}" > prometheus.yml
echo "${grafanaDatasourceYml}" > grafana-datasource.yml
echo "${dockerComposeYml}" > docker-compose.yml

docker compose up -d
`,
  },
  {
    dependsOn: [disk, staticIp, network],
  }
);

export const instanceIPs = instance.networkInterfaces.apply((nics) =>
  nics.map((nic) => nic.accessConfigs![0].natIp)
);
