const socket = io("http://localhost:3000");
let provider, signer, userAddress;
let board = null;
let game = new Chess();
let myColor = null; 
let activeGameId = null;

socket.on('connect', () => {
    console.log("Sunucuyla canlı hat kuruldu! Socket ID: " + socket.id);
    document.getElementById('status').innerText = "Sunucuya bağlandık bro, hazırız!";
});

// Cüzdan Bağlama
document.getElementById('connectWalletBtn').addEventListener('click', async () => {
    if (window.ethereum) {
        try {
            provider = new ethers.BrowserProvider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = await provider.getSigner();
            userAddress = await signer.getAddress();

            console.log("Cüzdan bağlandı:", userAddress);
            document.getElementById('walletAddress').innerText = userAddress.substring(0, 6) + "..." + userAddress.slice(-4);
            document.getElementById('connectWalletBtn').innerText = "Bağlandı ✅";
            document.getElementById('findPaidMatchBtn').disabled = false;
            document.getElementById('status').innerText = "Cüzdan bağlandı, maça hazırsın!";
        } catch (err) {
            console.error("Cüzdan bağlama hatası:", err);
        }
    } else {
        alert("Lütfen tarayıcına MetaMask yükle!");
    }
});

// BEDAVA Maç Arama
document.getElementById('findFreeMatchBtn').addEventListener('click', () => {
    const selectedDuration = document.getElementById('durationSelect').value;
    console.log(`[BEDAVA LOBİ]: ${selectedDuration} saniyelik maç aranıyor.`);
    document.getElementById('status').innerText = "Bedava lobi için rakip aranıyor...";
    socket.emit('joinFreeLobby', { duration: Number(selectedDuration) });
});

// Kontrat Bilgileri (Anvil'e deploy ettiğin ChessGame adresi ve ABI)
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // Örn: "0x5FbDB2315678afecb367f032d93F642f64180aa3"
const CONTRACT_ABI = [
    "function joinMoneyLobbyOrCreate(uint64 _gameId, uint32 _duration) external payable",
    "function systemBetAmount() external view returns (uint128)"
];

   // BAHİSLİ Maç Arama ve Akıllı Kontrata Bahis Yatırma
document.getElementById('findPaidMatchBtn').addEventListener('click', async () => {
    const selectedDuration = document.getElementById('durationSelect').value;
    const btn = document.getElementById('findPaidMatchBtn'); // Butonu seç
    
    if (!signer) {
        alert("Önce cüzdanını bağlamalısın!");
        return;
    }

    try {
        btn.disabled = true; // 🌟 KİLİT 1: Butonu anında kilitle! (Çift tıklama engeli)
        document.getElementById('status').innerText = "MetaMask üzerinden bahis yatırılıyor...";
        
        const chessContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        const betAmount = ethers.parseEther("0.05");
        
        // Ortak kullanılacak sayısal GameID
        const randomGameId = Math.floor(Math.random() * 1000000000);

        console.log(`[BLOKZİNCİR]: Kontrata bahis yatırılıyor... Oyun ID: ${randomGameId}`);

        const tx = await chessContract.joinMoneyLobbyOrCreate(randomGameId, Number(selectedDuration), {
            value: betAmount
        });

        document.getElementById('status').innerText = "İşlem blokzincire yazılıyor, bekleniyor...";
        await tx.wait();
        console.log("Bahis başarıyla yatırıldı!");

        document.getElementById('status').innerText = "Bahis yatırıldı, rakip aranıyor...";

        // Sunucuya bağlanıyoruz
        socket.emit('joinPaidLobby', { 
            gameId: randomGameId,
            duration: Number(selectedDuration),
            playerAddress: userAddress 
        });

    } catch (err) {
        console.error("Bahis yatırma hatası:", err);
        document.getElementById('status').innerText = "Bahis yatırma başarısız oldu!";
        btn.disabled = false; // Hata olursa tekrar basabilsin diye kilidi aç
        alert("İşlem iptal edildi veya hata oluştu: " + (err.reason || err.message));
    }
});

// --- TEK VE ORTAK OYUN BAŞLATMA DİNLEYİCİSİ ---
socket.on('gameStarted', (gameData) => {
    console.log("Oyun resmen başladı bro!", gameData);
    activeGameId = gameData.gameId; 
    document.getElementById('status').innerText = `Oyun Başladı! Oda ID: ${activeGameId}`;
    
    
    // Ücretsiz mi paralı mı olduğuna bakarak rengimizi güvenle belirliyoruz
    if (gameData.white === socket.id || (gameData.white && gameData.white === socket.id)) {
        myColor = 'white';
    } else if (gameData.black === socket.id || (gameData.black && gameData.black === socket.id)) {
        myColor = 'black';
    } else if (gameData.white && userAddress && typeof gameData.white === 'string' && gameData.white.startsWith('0x')) {
        // Paralı oyun (cüzdan adresleri üzerinden)
        myColor = (gameData.white.toLowerCase() === userAddress.toLowerCase()) ? 'white' : 'black';
    } else {
        // Garanti yedek durum
        myColor = 'white';
    }

    console.log("Net olarak belirlenen benim rengim:", myColor);

    document.getElementById('lobby-section').style.display = 'none';
    document.getElementById('board').style.display = 'block';
    document.getElementById('timer-section').style.display = 'block';

    const config = {
        draggable: true,
        position: 'start',
        orientation: myColor,
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    };

    board = Chessboard('board', config);
});


socket.on('waitingForOpponent', (data) => {
    console.log(data.message);
    document.getElementById('status').innerText = data.message;
});


function onDragStart(source, piece, position, orientation) {
    if (game.game_over()) return false;
    if (myColor === 'white' && piece.search(/^b/) !== -1) return false;
    if (myColor === 'black' && piece.search(/^w/) !== -1) return false;
}

function onDrop(source, target) {
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q' 
    });

    if (move === null) return 'snapback';

    // Hamleyi sunucuya bildiriyoruz
    socket.emit('makeMove', {
        gameId: activeGameId,
        move: move
    });

    // 🌟 YENİ EKLENEN: Hamleyi yapan oyuncunun anında sonucu görmesi için
    if (game.game_over()) {
        if (isGameOverHandled) return;
        if (game.in_checkmate()) {
            // Hamleyi biz yaptık ve oyun bitti, demek ki biz mat ettik!
            handleGameOver("Tebrikler! Rakibi mat ettin, kazandın! 🏆");
        } else {
            handleGameOver("Oyun bitti (Beraberlik/Pat)!");
        }
    }
}

function onSnapEnd() {
    board.position(game.fen());
}

// Sayfanın birden fazla kez yenilenmesini veya mesaj atmasını engelleyen kilit
let isGameOverHandled = false; 

socket.on('opponentMove', (data) => {
    console.log("Rakipten hamle geldi:", data.move);
    
    game.move(data.move);
    board.position(game.fen());

    if (game.game_over()) {
        if (isGameOverHandled) return;
        
        if (game.in_checkmate()) {
            handleGameOver("Şah Mat! Rakip seni mat etti, kaybettin!");
        } else {
            handleGameOver("Oyun bitti (Beraberlik/Pat)!");
        }
    }
});

socket.on('gameEnded', (data) => {
    if (isGameOverHandled) return; 
    
    console.log("🔥 GAME ENDED EVENTİ YAKALANDI:", data);
    let resultMessage = data.message || "Oyun sona erdi!";
    
    if (data.winner && myColor) {
        const normalizedMyColor = myColor.trim().toLowerCase();
        const normalizedWinner = data.winner.trim().toLowerCase();
        
        const didIWin = (normalizedMyColor === normalizedWinner);
        resultMessage = didIWin ? "Tebrikler, Oyunu Kazandın! 🏆" : "Maalesef Kaybettin! 😔";
    }

    handleGameOver(resultMessage);
});

function handleGameOver(message) {
    if (isGameOverHandled) return;
    isGameOverHandled = true; // Kilidi kapat, bir daha burası tetiklenmesin
    
    console.log("🏁 handleGameOver tetiklendi, mesaj:", message);
    
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerText = message;
    }
    
    // Yönlendirme öncesi oyuncuya açıkça pop-up gösteriyoruz
    alert(message); 
    
    setTimeout(() => {
        console.log("🔄 Sayfa yenileniyor ve ana sayfaya dönülüyor...");
        location.reload(); 
    }, 1500);
}
// Sunucudan gelen kalan süreleri ekrana yazdırma
socket.on('updateTimer', (times) => {
    const whiteEl = document.getElementById('whiteTime');
    const blackEl = document.getElementById('blackTime');
    
    if (whiteEl && blackEl) {
        whiteEl.innerText = times.white;
        blackEl.innerText = times.black;
    }
});