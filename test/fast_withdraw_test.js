const { expect } = require('chai');
const { deploy} = require('./utils');
const { calAcceptHash, extendAddress} = require('../script/op_utils');
const {parseEther, parseUnits} = require("ethers/lib/utils");
const {BigNumber} = require("ethers");

describe('Fast withdraw unit tests', function () {
    let deployedInfo;
    let zkLink, periphery, token2, token2Id, token5, token5Id, defaultSender, alice, bob;
    before(async () => {
        deployedInfo = await deploy();
        zkLink = deployedInfo.zkLink;
        periphery = deployedInfo.periphery;
        token2 = deployedInfo.token2.contract;
        token2Id = deployedInfo.token2.tokenId;
        token5 = deployedInfo.token5.contract;
        token5Id = deployedInfo.token5.tokenId;
        defaultSender = deployedInfo.defaultSender;
        alice = deployedInfo.alice;
        bob = deployedInfo.bob;
    });

    it('normal withdraw erc20 token should success', async () => {
        const chainId = 1;
        const accountId = 1;
        const subAccountId = 1;
        const tokenId = token2Id;
        const amount = parseEther("10");
        const fee = 0;
        const owner = bob.address;
        const nonce = 0;
        const fastWithdrawFeeRate = 50;
        const fastWithdraw = 0;

        const op = {
            "chainId": chainId,
            "accountId":accountId,
            "subAccountId":subAccountId,
            "tokenId":tokenId,
            "amount":amount,
            "fee":fee,
            "owner":owner,
            "nonce":nonce,
            "fastWithdrawFeeRate":fastWithdrawFeeRate,
            "fastWithdraw":fastWithdraw
        }

        await token2.mintTo(zkLink.address, amount);

        const b0 = await token2.balanceOf(owner);
        await zkLink.testExecuteWithdraw(op);
        await periphery.withdrawPendingBalance(owner, tokenId, amount);
        const b1 = await token2.balanceOf(owner);
        expect(b1.sub(b0)).to.eq(amount);
    });

    it('fast withdraw and accept finish, token should be sent to acceptor and dust should be sent to owner', async () => {
        const chainId = 1;
        const accountId = 1;
        const subAccountId = 1;
        const token = token5;
        const tokenId = token5Id;
        const l2Amount = parseEther("10.0000005"); // 10000000500000000000
        const l1Amount = parseUnits("10", 6); // 10000000
        const l2AmountOfAcceptor = parseEther("10"); // 10000000000000000000
        const l2DustAmountOfOwner = parseEther("0.0000005"); // 500000000000
        const fee = 0;
        const owner = alice.address;
        const nonce = 1;
        const fastWithdrawFeeRate = 50;
        const fastWithdraw = 1;
        const MAX_WITHDRAW_FEE_RATE = 10000;

        const bobBalance0 = await token.balanceOf(bob.address);
        const bobPendingBalance0 = await periphery.getPendingBalance(extendAddress(bob.address), tokenId);
        const aliceBalance0 = await token.balanceOf(alice.address);
        const alicePendingBalance0 = await periphery.getPendingBalance(extendAddress(alice.address), tokenId);

        await token.mintTo(bob.address, l1Amount);
        const amountTransfer = l1Amount.mul(BigNumber.from(MAX_WITHDRAW_FEE_RATE-fastWithdrawFeeRate)).div(BigNumber.from(MAX_WITHDRAW_FEE_RATE));
        await token.connect(bob).approve(periphery.address, amountTransfer);
        await periphery.connect(bob).acceptERC20(bob.address, accountId, owner, tokenId, l1Amount, fastWithdrawFeeRate, accountId, subAccountId, nonce, amountTransfer);

        const op = {
            "chainId": chainId,
            "accountId":accountId,
            "subAccountId":subAccountId,
            "tokenId":tokenId,
            "amount":l2Amount,
            "fee":fee,
            "owner":owner,
            "nonce":nonce,
            "fastWithdrawFeeRate":fastWithdrawFeeRate,
            "fastWithdraw":fastWithdraw
        }

        await zkLink.testExecuteWithdraw(op);

        const aliceBalance1 = await token.balanceOf(alice.address);
        const alicePendingBalance1 = await periphery.getPendingBalance(extendAddress(alice.address), tokenId);
        const bobBalance1 = await token.balanceOf(bob.address);
        const bobPendingBalance1 = await periphery.getPendingBalance(extendAddress(bob.address), tokenId);
        expect(aliceBalance1.sub(aliceBalance0)).to.eq(amountTransfer); // owner receive amountTransfer = l1Amount - fee
        expect(bobBalance1.sub(bobBalance0)).to.eq(l1Amount.sub(amountTransfer)); // l1Amount - amountTransfer is the profit of acceptor
        expect(bobPendingBalance1.sub(bobPendingBalance0)).to.eq(l2AmountOfAcceptor); // acceptor pending balance increase
        expect(alicePendingBalance1.sub(alicePendingBalance0)).to.eq(l2DustAmountOfOwner); // owner pending balance increase dust amount
    });

    it('fast withdraw but accept not finish, token should be sent to owner as normal', async () => {
        const chainId = 1;
        const accountId = 1;
        const subAccountId = 1;
        const tokenId = token2Id;
        const amount = parseEther("10");
        const fee = 0;
        const owner = alice.address;
        const nonce = 2;
        const fastWithdrawFeeRate = 50;
        const fastWithdraw = 1;

        const aliceBalance0 = await token2.balanceOf(alice.address);

        const op = {
            "chainId": chainId,
            "accountId":accountId,
            "subAccountId":subAccountId,
            "tokenId":tokenId,
            "amount":amount,
            "fee":fee,
            "owner":owner,
            "nonce":nonce,
            "fastWithdrawFeeRate":fastWithdrawFeeRate,
            "fastWithdraw":fastWithdraw
        }

        await token2.mintTo(zkLink.address, amount);

        await zkLink.testExecuteWithdraw(op);
        await periphery.withdrawPendingBalance(alice.address, tokenId, amount);
        const aliceBalance1 = await token2.balanceOf(alice.address);
        expect(aliceBalance1.sub(aliceBalance0)).to.eq(amount);
        const hash = calAcceptHash(owner, tokenId, amount, fastWithdrawFeeRate, accountId, subAccountId, nonce);
        expect(await periphery.getAcceptor(accountId, hash)).to.eq(owner);
    });
});
