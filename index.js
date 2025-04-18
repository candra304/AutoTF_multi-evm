import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import chalk from "chalk";
import { exit } from "process";
dotenv.config();

// Provider dari file .env
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const tokenAddress = process.env.TOKEN_ADDRESS;

// ABI ERC-20
const erc20Abi = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)"
];

// Fungsi menampilkan banner
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

// Fungsi input dari user
async function askQuestion(query) {
    process.stdout.write(chalk.yellow(query));
    return new Promise(resolve => {
        process.stdin.once("data", data => resolve(data.toString().trim()));
    });
}

// Fungsi utama
async function autoTransfer() {
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

    const mode = await askQuestion(
        "Pilih mode transfer (1 untuk ETH, 2 untuk Token ERC-20): "
    );

    if (!["1", "2"].includes(mode)) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    const amountInput = await askQuestion("Masukkan jumlah yang akan dikirim (contoh: 0.005): ");
    const amount = ethers.parseEther(amountInput);

    console.log(chalk.yellow(`\n🚀 Mode: ${mode === "1" ? "ETH" : "Token ERC-20"} | Jumlah: ${amountInput}\n`));

    for (let i = 0; i < privateKeys.length; i++) {
        console.log(chalk.magentaBright(`\n🔄 Memproses akun ke-${i + 1}...`));

        const rawKey = privateKeys[i];
        let senderWallet;

        try {
            senderWallet = new ethers.Wallet(rawKey, provider);
        } catch (error) {
            console.log(chalk.red(`❌ Gagal inisialisasi wallet ke-${i + 1}: ${error.message}`));
            continue;
        }

        console.log(chalk.blueBright(`💳 Akun: ${senderWallet.address} (Wallet ke-${i + 1}) sedang diproses...`));

        let balance;
        try {
            balance = await provider.getBalance(senderWallet.address);
        } catch (err) {
            console.log(chalk.red(`❌ Gagal ambil saldo: ${err.message}`));
            continue;
        }

        if (mode === "1" && balance < amount) {
            console.log(chalk.red(`⛔ Wallet tidak cukup saldo (${ethers.formatEther(balance)} ETH)`));
            continue;
        }

        const tokenContract = mode === "2" ? new ethers.Contract(tokenAddress, erc20Abi, senderWallet) : null;

        if (mode === "2") {
            try {
                balance = await tokenContract.balanceOf(senderWallet.address);
            } catch (err) {
                console.log(chalk.red(`❌ Gagal ambil saldo token: ${err.message}`));
                continue;
            }

            if (balance < amount) {
                console.log(chalk.red(`⛔ Wallet tidak cukup saldo token (${ethers.formatEther(balance)} Token)`));
                continue;
            }
        }

        for (let j = 0; j < recipients.length; j++) {
            const recipient = recipients[j];
            try {
                let tx;
                if (mode === "1") {
                    tx = await senderWallet.sendTransaction({
                        to: recipient,
                        value: amount
                    });
                } else {
                    tx = await tokenContract.transfer(recipient, amount);
                }

                console.log(chalk.green(`✅ TX dari wallet ke-${i + 1} ke penerima ${j + 1} | Hash: ${tx.hash}`));
                await tx.wait();
            } catch (err) {
                console.log(chalk.red(`❌ Gagal kirim ke ${recipient}: ${err.message}`));
            }

            console.log(chalk.gray("⌛ Tunggu 3 detik sebelum lanjut...\n"));
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    console.log(chalk.greenBright("\n🎉 Semua akun telah diproses!\n"));
}

async function start() {
    showBanner();
    await autoTransfer();
}

start();
