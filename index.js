import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import chalk from "chalk";
import { exit } from "process";
dotenv.config();

// Ambil semua RPC dari env
function getRpcList() {
    const rpcList = [];
    for (let i = 1; ; i++) {
        const name = process.env[`RPC_${i}_NAME`];
        const url = process.env[`RPC_${i}_URL`];
        const token = process.env[`RPC_${i}_TOKEN`];
        if (!name || !url) break;
        rpcList.push({ name, url, token });
    }
    return rpcList;
}

// ABI ERC-20
const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// Fungsi banner
function showBanner() {
    console.clear();
    console.log(chalk.magentaBright(`
========================================
  █████╗ ██╗   ██╗████████╗ ██████╗ 
 ██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗
 ███████║██║   ██║   ██║   ██║   ██║
 ██╔══██║██║   ██║   ██║   ██║   ██║
 ██║  ██║╚██████╔╝   ██║   ╚██████╔╝
 ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ 
SAT SET AUTO TRANSFER
                           [by Chandra]
========================================
`));
}

// Input dari user
async function askQuestion(query) {
    process.stdout.write(chalk.yellow(query));
    return new Promise(resolve => {
        process.stdin.once("data", data => resolve(data.toString().trim()));
    });
}

// Ambil info token: decimals + symbol
async function getTokenInfo(provider, tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const decimals = await tokenContract.decimals();
    const symbol = await tokenContract.symbol();
    return { decimals, symbol };
}

// Fungsi utama
async function autoTransfer(selectedRpc) {
    const receiverFile = "addresspenerima.txt";
    const senderFile = "walletpengirim.txt";

    if (!fs.existsSync(receiverFile) || !fs.existsSync(senderFile)) {
        console.log(chalk.red(`❌ File '${receiverFile}' atau '${senderFile}' tidak ditemukan.`));
        exit(1);
    }

    const recipients = fs.readFileSync(receiverFile, "utf8")
        .split("\n")
        .map(p => p.trim())
        .filter(p => p.length > 0);

    const privateKeys = fs.readFileSync(senderFile, "utf8")
        .split("\n")
        .map(p => p.trim())
        .filter(p => p.length > 0);

    const provider = new ethers.JsonRpcProvider(selectedRpc.url);
    const tokenAddress = selectedRpc.token;

    const mode = await askQuestion(
        "\nPilih mode transfer:\n  1. Native Coin\n  2. Token ERC-20\n=> Pilih (1/2): "
    );

    if (!["1", "2"].includes(mode)) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    console.log(chalk.cyan("\nPilih jumlah yang akan dikirim:"));
    console.log("  1. Masukkan jumlah manual");
    console.log("  2. Kirim 99% dari saldo");
    console.log("  3. Kirim random antara 0.01% - 0.1% dari saldo");
    const amountMode = await askQuestion("=> Pilih (1/2/3): ");

    let manualAmountInput;
    if (amountMode === "1") {
        manualAmountInput = await askQuestion("Masukkan jumlah yang akan dikirim (contoh: 0.005): ");
    }

    console.log(chalk.yellow(`\n🚀 Chain: ${selectedRpc.name} | Mode: ${mode === "1" ? "Native Coin" : "Token ERC-20"}\n`));

    let tokenInfo;
    if (mode === "2") {
        tokenInfo = await getTokenInfo(provider, tokenAddress);
    }

    for (let i = 0; i < privateKeys.length; i++) {
        console.log(chalk.cyanBright(`👩‍💻 [${i + 1}] Memproses wallet ke-${i + 1}...`));

        const rawKey = privateKeys[i];
        let senderWallet;

        try {
            senderWallet = new ethers.Wallet(rawKey, provider);
        } catch (error) {
            console.log(chalk.red(`❌   Gagal inisialisasi wallet ke-${i + 1}: ${error.message}`));
            continue;
        }

        console.log(chalk.blueBright(`👩‍💻   Alamat: ${senderWallet.address} (Wallet ke-${i + 1})`));

        if (mode === "2") {
            const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, senderWallet);
            try {
                const balance = await tokenContract.balanceOf(senderWallet.address);
                const decimals = tokenInfo.decimals;
                const symbol = tokenInfo.symbol;

                console.log(chalk.greenBright(`✅   Saldo token: ${ethers.formatUnits(balance, decimals)} ${symbol}`));

                let rawAmount;
                if (amountMode === "1") {
                    rawAmount = ethers.parseUnits(manualAmountInput, decimals);
                } else if (amountMode === "2") {
                    rawAmount = balance * 99n / 100n;
                } else if (amountMode === "3") {
                    const randomPercentInt = BigInt(Math.floor(Math.random() * (10 - 1 + 1) + 1)); // 1-10
                    rawAmount = balance * randomPercentInt / 10000n;
                }

                if (balance < rawAmount) {
                    console.log(chalk.red(`❌   Wallet tidak cukup saldo token`));
                    continue;
                }

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blueBright(`👩‍💻   [${i + 1}.${j + 1}] Kirim ke: ${recipient}`));

                    try {
                        const tx = await tokenContract.transfer(recipient, rawAmount);
                        console.log(chalk.green(`✅   Mengirim ${ethers.formatUnits(rawAmount, decimals)} ${symbol} ke ${recipient}`));
                        console.log(chalk.green(`✅   TX Hash: ${tx.hash}`));
                        await tx.wait();
                    } catch (err) {
                        console.log(chalk.red(`❌   Gagal kirim token: ${err.message}`));
                    }

                    console.log(chalk.gray(`⏳   Tunggu 3 detik...\n`));
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (err) {
                console.log(chalk.red(`❌   Gagal memproses token: ${err.message}`));
            }
        } else {
            try {
                const balance = await provider.getBalance(senderWallet.address);
                console.log(chalk.greenBright(`✅   Saldo native: ${ethers.formatEther(balance)} ${selectedRpc.name}`));

                let sendAmount;
                if (amountMode === "1") {
                    sendAmount = ethers.parseEther(manualAmountInput);
                } else if (amountMode === "2") {
                    sendAmount = balance * 99n / 100n;
                } else if (amountMode === "3") {
                    const randomPercentInt = BigInt(Math.floor(Math.random() * (10 - 1 + 1) + 1)); // 1-10
                    sendAmount = balance * randomPercentInt / 10000n;
                }

                if (balance < sendAmount) {
                    console.log(chalk.red(`❌   Wallet tidak cukup saldo native`));
                    continue;
                }

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blueBright(`👩‍💻   [${i + 1}.${j + 1}] Kirim ke: ${recipient}`));

                    try {
                        const tx = await senderWallet.sendTransaction({
                            to: recipient,
                            value: sendAmount
                        });
                        console.log(chalk.green(`✅   Mengirim ${ethers.formatEther(sendAmount)} native coin ke ${recipient}`));
                        console.log(chalk.green(`✅   TX Hash: ${tx.hash}`));
                        await tx.wait();
                    } catch (err) {
                        console.log(chalk.red(`❌   Gagal kirim native coin: ${err.message}`));
                    }

                    console.log(chalk.gray(`⏳   Tunggu 3 detik...\n`));
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (err) {
                console.log(chalk.red(`❌   Gagal ambil saldo native: ${err.message}`));
            }
        }
    }

    console.log(chalk.greenBright("\n🎉 Semua akun telah diproses!\n"));
}

// START
async function start() {
    showBanner();
    const rpcList = getRpcList();

    if (rpcList.length === 0) {
        console.log(chalk.red("❌ Tidak ada RPC yang ditemukan di .env!"));
        exit(1);
    }

    console.log("Daftar Chain:");
    rpcList.forEach((rpc, index) => {
        console.log(`${index + 1}. ${rpc.name}`);
    });

    const selectedIndex = await askQuestion("Pilih chain (masukkan nomor): ");
    const selectedRpc = rpcList[Number(selectedIndex) - 1];

    if (!selectedRpc) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    console.log(chalk.green(`\n✅ Kamu memilih: ${selectedRpc.name}\n`));
    await autoTransfer(selectedRpc);
}

start();
