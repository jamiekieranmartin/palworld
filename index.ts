import "dotenv/config";
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import { readFileSync } from "fs";

const GCP_ORG_ID = process.env.GCP_ORG_ID;
const GCP_BILLING_ACCOUNT = process.env.GCP_BILLING_ACCOUNT;

if (!GCP_ORG_ID) {
  throw new Error("GCP_ORG_ID is required");
}
if (!GCP_BILLING_ACCOUNT) {
  throw new Error("GCP_BILLING_ACCOUNT is required");
}

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
sudo apt-get update
sudo apt-get install -y docker.io

curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
sudo bash add-google-cloud-ops-agent-repo.sh --also-install

mkdir palworld
sudo chmod -R a+rwx /palworld
echo "${readFileSync(".env.palworld", "utf8")}" > /palworld/.env
sudo docker run -d --name palworld-server -p 8211:8211/udp -p 27015:27015/udp -v /palworld:/palworld --env-file /palworld/.env --restart unless-stopped thijsvanloef/palworld-server-docker:latest
`,
  },
  {
    dependsOn: [disk, staticIp, network],
  }
);

export const instanceIPs = instance.networkInterfaces.apply((nics) =>
  nics.map((nic) => nic.accessConfigs![0].natIp)
);
