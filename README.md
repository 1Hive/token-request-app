# Token Request <img align="right" src="https://github.com/1Hive/website/blob/master/website/static/img/bee.png" height="80px" />

[![CircleCI](https://circleci.com/gh/1Hive/token-request-app.svg?style=svg)](https://circleci.com/gh/1Hive/token-request-app)
[![Coverage Status](https://coveralls.io/repos/github/1Hive/token-request-app/badge.svg?branch=master&service=github)](https://coveralls.io/github/1Hive/token-request-app?branch=master&service=github)

1Hive's Token Request app allows users to create a vote which requests an Organization's tokens in exchange for payment. For example a user may request minting 100 organization tokens in exchange for 100 DAI. The request would require a vote to approve, if the vote is rejected the user would receive their payment back and if it is approved the payment would be deposited in the organization's vault.

#### 🐲 Project stage: development

The Token Request app is still in development, a first implementation was published to `token-request.open.aragonpm.eth`. If you are interested in contributing please see our open [issues](https://github.com/1hive/token-request-app/issues).

#### 🚨 Security review status: pre-audit

The code in this repo has not been audited.

## How does it work

The Token Request App should be granted the `Create Votes` permission on an instance of the Aragon `Voting` app. When a user makes a request they should transfer the payment to the Token Request app which will hold them in escrow while the vote is created and executed. If the vote duration passes and the payment is still in the Token Request app, the user should be able to claim **their** tokens. If the vote passes then executing the vote should transfer the users tokens from the Token Request app to the organizations vault, and mint tokens from the token manager for the user.

### Initialization

The Token Request needs to be passed the address of a `voting` app instance, the address a `token manager` instance, the address of the payment token contract, and the address of the organization's `vault`.

### Roles

The Token Request application should implement the following roles:

- **Request Tokens**
- **Change Vault Address**
- **Change Token Manager Address**
- **Change Voting Address**
- **Change Payment Token**

### Interface

We do not need to provide an interface for changing parameters as this can be done by power users using the aragonCLI.

We do need to provide an interface for requesting tokens, which would allow users to specify the amount and the associated payment.

We do need to provide an interface for claiming payments when the request is rejected.

## How to run Token Request app locally

First make sure that you have node, npm, and the aragonCLI installed and working. Instructions on how to set that up can be found [here](https://hack.aragon.org/docs/cli-intro.html). You'll also need to have [Metamask](https://metamask.io) or some kind of web wallet enabled to sign transactions in the browser.

Git clone this repo.

```sh
git clone https://github.com/1Hive/token-request-app.git
```

Navigate into the `token-request-app` directory.

```sh
cd token-request-app
```

Install npm dependencies.

```sh
npm i
```

Deploy a dao with Lock app installed on your local environment.

```sh
npm run start:template
```

## How to deploy to an organization

TODO:
