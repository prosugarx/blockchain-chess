// --- Global Değişkenler ve Web3 Bağlantısı ---
let provider = null;
let signer = null;
let contract = null;
let userAddress = null;

// Satranç Kütüphane Nesneleri
let board = null;
let game = new Chess();
let currentGameId = null;
let isMyTurn = true; 
let myColor = 'w'; 
let isSinglePlayerMode = true; 

// --- ANVIL KONTRAT BİLGİLERİ ---
// UYARI: Anvil'e deploy ettiğin (forge create sonrası terminalde çıkan) adresi buraya yazmalısın!
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 

const CONTRACT_ABI = [
    {
        "inputs": [
            {"internalType": "string", "name": "_initialFen", "type": "string"},
            {"internalType": "bool", "name": "_isWagered", "type": "bool"}
        ],
        "name": "createGame",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "_gameId", "type": "uint256"}],
        "name": "joinGame",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "_gameId", "type": "uint256"},
            {"internalType": "string", "name": "_newFen", "type": "string"}
        ],
        "name": "makeMove",
        "outputs": [],
        "stateMutability": "external",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "_gameId", "type": "uint256"},
            {"internalType": "address", "name": "_winner", "type": "address"}
        ],
        "name": "endGame",
        "outputs": [],
        "stateMutability": "external",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "name": "games",
        "outputs": [
            {"internalType": "uint256", "name": "gameId", "type": "uint256"},
            {"internalType": "bool", "name": "isGameActive", "type": "bool"},
            {"internalType": "bool", "name": "isTurnWhite", "type": "bool"},
            {"internalType": "bool", "name": "isEnded", "type": "bool"},
            {"internalType": "bool", "name": "isWagered", "type": "bool"},
            {"internalType": "uint256", "name": "betAmount", "type": "uint256"},
            {"internalType": "uint256", "name": "creationTime", "type": "uint256"},
            {"internalType": "address", "name": "whitePlayer", "type": "address"},
            {"internalType": "address", "name": "blackPlayer", "type": "address"},
            {"internalType": "address", "name": "winner", "type": "address"},
            {"internalType": "string", "name": "currentFen", "type": "string"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

const FIXED_BET_AMOUNT = "0.001"; 

$(document).ready(function() {
    initChessBoard(); 
    setupEventListeners();
    checkGameModeSettings();
});

function initChessBoard() {
    const config = {
        draggable: true,
        position: 'start',
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd,
        pieceTheme: 'img/chesspieces/wikipedia/{piece}.png' 
    };
    board = Chessboard('chessBoard', config);
    updateStatusText("Kendi Kendine mod aktif. Çevrimiçi Anvil maçları için cüzdan bağlayın.");
}

function checkGameModeSettings() {
    const selectType = $("#gameTypeSelect").val();
    if (selectType === "single") {
        isSinglePlayerMode = true;
        $("#createGameBtn").prop("disabled", false).text("Lokal Maç Başlat");
        $("#joinGameBtn").prop("disabled", true);
    } else {
        isSinglePlayerMode = false;
        $("#createGameBtn").text("Oyun Kur");
        if (!userAddress) {
            $("#createGameBtn").prop("disabled", true);
            $("#joinGameBtn").prop("disabled", true);
        } else {
            $("#createGameBtn").prop("disabled", false);
            $("#joinGameBtn").prop("disabled", false);
        }
    }
}

// --- Anvil Cüzdan Bağlantısı ---
async function connectWallet() {
    if (window.ethereum) {
        try {
            // Anvil lokal ağı için ağ kontrolü yapalım
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId !== '0x7a69') { // 0x7a69 = Onaltılık tabanda 31337 (Anvil varsayılanı)
                alert("Lütfen MetaMask'ınızdan Anvil (Localhost 8545 / Chain ID 31337) ağına geçiş yapın!");
                return;
            }

            provider = new ethers.BrowserProvider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();
            
            contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

            const balanceWei = await provider.getBalance(userAddress);
            const balanceEth = ethers.formatEther(balanceWei);

            $("#walletAddress").text(`${userAddress.substring(0,6)}...${userAddress.substring(38)} (${parseFloat(balanceEth).toFixed(2)} ETH)`);
            $("#connectWalletBtn").text("Anvil Bağlı").removeClass("btn-primary").addClass("btn-success").prop("disabled", true);
            
            updateStatusText("Anvil cüzdanı doğrulandı. İşlemler hazır.");
            checkGameModeSettings();
            listenToContractEvents(); 
        } catch (error) {
            console.error("Bağlantı hatası:", error);
            alert("Bağlantı hatası: " + error.message);
        }
    } else {
        alert("MetaMask bulunamadı!");
    }
}

// --- Anvil Para Transferleri ve Oyun Kurma ---
async function createNewGame() {
    if (isSinglePlayerMode) {
        game.reset();
        board.start();
        currentGameId = null;
        isMyTurn = true;
        updateStatusText("Yeni lokal oyun başladı.");
        return;
    }

    const selectType = $("#gameTypeSelect").val();
    const isWagered = (selectType === "wagered");
    const initialFen = game.fen();

    try {
        updateStatusText("Anvil ağına tx gönderiliyor...");

        // Anvil/Hardhat gibi yerel ağlarda gas limitini manuel fırlatmak bildirim sorununu çözer
        let tx;
        if (isWagered) {
            const requiredWei = ethers.parseEther(FIXED_BET_AMOUNT);
            tx = await contract.createGame(initialFen, true, { 
                value: requiredWei,
                gasLimit: 300000 // Manuel gas limiti
            });
        } else {
            tx = await contract.createGame(initialFen, false, { gasLimit: 200000 });
        }

        updateStatusText("Anvil bloğu kazılıyor (Mining)...");
        await tx.wait();
    } catch (error) {
        console.error("Anvil Tx Hatası:", error);
        updateStatusText("Hata: " + error.message);
        alert("İşlem başarısız oldu! MetaMask'tan nonce sıfırlamayı veya kontrat adresini kontrol edin.");
    }
}

async function joinExistingGame() {
    if (isSinglePlayerMode) return;
    const gameId = $("#gameIdInput").val();
    if (!gameId) return alert("Oyun ID girin.");

    try {
        updateStatusText("Oyun verisi Anvil'den okunuyor...");
        const gameData = await contract.games(BigInt(gameId));

        let tx;
        if (gameData.isWagered) {
            const requiredWei = ethers.parseEther(FIXED_BET_AMOUNT);
            tx = await contract.joinGame(BigInt(gameId), { 
                value: requiredWei,
                gasLimit: 300000 
            });
        } else {
            tx = await contract.joinGame(BigInt(gameId), { gasLimit: 200000 });
        }

        updateStatusText("Katılım onaylanıyor...");
        await tx.wait();
    } catch (error) {
        console.error("Katılım hatası:", error);
        alert("Katılım hatası: " + error.message);
    }
}

async function sendMoveToBlockchain(newFen) {
    if (isSinglePlayerMode || !currentGameId) return;
    try {
        updateStatusText("Hamle cüzdana gönderildi...");
        const tx = await contract.makeMove(BigInt(currentGameId), newFen, { gasLimit: 150000 });
        await tx.wait();
        updateStatusText("Hamle onaylandı.");
    } catch (error) {
        console.error("Hamle hatası:", error);
        syncGameStatus();
    }
}

async function triggerEndGame(winnerAddress) {
    if (isSinglePlayerMode || !currentGameId) return;
    try {
        updateStatusText("Oyun sonlandırılıyor...");
        const tx = await contract.endGame(BigInt(currentGameId), winnerAddress, { gasLimit: 250000 });
        await tx.wait();
        updateStatusText("Maç bitti, havuz dağıtıldı.");
    } catch (error) {
        console.error("Bitiş hatası:", error);
    }
}

function listenToContractEvents() {
    contract.on("GameCreated", (gameId, whitePlayer, isWagered, initialFen) => {
        if (whitePlayer.toLowerCase() === userAddress.toLowerCase()) {
            currentGameId = gameId.toString();
            myColor = 'w'; 
            board.orientation('white');
            $("#currentGameId").text(currentGameId);
            isMyTurn = false; 
            updateStatusText(`Oyun #${currentGameId} Anvil'de kuruldu. Rakip bekleniyor.`);
        }
    });

    contract.on("GameJoined", async (gameId, blackPlayer) => {
        if (currentGameId && gameId.toString() === currentGameId) {
            isMyTurn = (myColor === 'w'); 
            updateStatusText("Rakip bağlandı! Paralar eşlendi. Sıra Beyazda.");
            syncGameStatus();
        } else if (blackPlayer.toLowerCase() === userAddress.toLowerCase()) {
            currentGameId = gameId.toString();
            myColor = 'b'; 
            board.orientation('black');
            $("#currentGameId").text(currentGameId);
            isMyTurn = false; 
            updateStatusText("Oyuna girdiniz. Beyaz bekleniyor.");
            syncGameStatus();
        }
    });

    contract.on("MoveMade", (gameId, newFen, isTurnWhite) => {
            if (currentGameId && gameId.toString() === currentGameId) {
                game.load(newFen);
                board.position(newFen);
                
                if ((isTurnWhite && myColor === 'w') || (!isTurnWhite && myColor === 'b')) {
                    isMyTurn = true;
                    updateStatusText("Sıra sizde!");
                } else {
                    isMyTurn = false;
                    updateStatusText("Rakip bekleniyor...");
                }
                $("#gameTurn").text(isTurnWhite ? "Beyaz" : "Siyah");
            }
        });
}

async function syncGameStatus() {
    if (!currentGameId) return;
    const gameData = await contract.games(BigInt(currentGameId));
    game.load(gameData.currentFen);
    board.position(gameData.currentFen);
}

function onDragStart(source, piece, position, orientation) {
    if (game.game_over()) return false;
    if (isSinglePlayerMode) return true;
    if (!currentGameId || !isMyTurn) return false;
    
    if ((myColor === 'w' && piece.search(/^b/) !== -1) || 
        (myColor === 'b' && piece.search(/^w/) !== -1)) {
        return false;
    }
}

function onDrop(source, target) {
    let move = game.move({ 
        from: source, 
        to: target, 
        promotion: 'q' 
    });
    
    if (move === null) return 'snapback';

    if (isSinglePlayerMode) {
        updateStatusText(game.turn() === 'w' ? "Sıra Beyazda" : "Sıra Siyahda");
        return;
    }

    isMyTurn = false;
    if (game.game_over()) {
        checkGameResult();
    } else {
        sendMoveToBlockchain(game.fen());
    }
}

function onSnapEnd() {
    board.position(game.fen());
}

function checkGameResult() {
    if (game.in_checkmate()) {
        let winnerAddress = (game.turn() === 'w') ? "black" : "white";
        getWinnerAddress(winnerAddress).then(addr => triggerEndGame(addr));
    } else if (game.in_draw() || game.in_stalemate() || game.in_threefold_repetition()) {
        triggerEndGame(ethers.ZeroAddress);
    }
}

async function getWinnerAddress(colorKeyword) {
    const gameData = await contract.games(BigInt(currentGameId));
    return (colorKeyword === "white") ? gameData.whitePlayer : gameData.blackPlayer;
}

function setupEventListeners() {
    $("#connectWalletBtn").on("click", connectWallet);
    $("#createGameBtn").on("click", createNewGame);
    $("#joinGameBtn").on("click", joinExistingGame);
    $("#gameTypeSelect").on("change", checkGameModeSettings);
}
