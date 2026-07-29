const express = require('express'); 
const app = express();               
const crypto = require('crypto');   
const { ethers } = require("ethers"); 

const PORT = 3000; 
const http = require('http'); 
const { Server } = require('socket.io'); 
const server = http.createServer(app); 

const io = new Server(server, { 
    cors: {
        origin: '*', 
        methods: ['GET', 'POST'] 
    }
});

const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545"); 
const serverPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; 
const wallet = new ethers.Wallet(serverPrivateKey, provider);
const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const contractABI = [
    "function finalizeGame(uint64 _gameId, address _winner, bool _isDraw) external" 
];
const chessContract = new ethers.Contract(contractAddress, contractABI, wallet);

const activeGames = {};     
const freeLobbies = {};
const paidLobbies = {}; 

io.on('connection', (socket) => { 
    console.log('Bir oyuncu bağlandı: ' + socket.id); 

    socket.on('joinFreeLobby', ({ duration }) => { 
        console.log(`Oyuncu ${socket.id} free lobby'ye katıldı. Süre: ${duration} saniye.`);
        if (!freeLobbies[duration]) {
            freeLobbies[duration] = socket.id;
            socket.emit('waitingForOpponent', { message: 'Rakip bekleniyor...' }); 
        } 
        else {
            const opponentSocketId = freeLobbies[duration]; 
            delete freeLobbies[duration]; 
            const freeGameId = "free_" + crypto.randomUUID();            
            
            socket.join(freeGameId); 
            console.log(`[ODA KONTROL]: Siyah oyuncu (${socket.id}) ${freeGameId} odasına katıldı.`);

            const opponentSocket = io.sockets.sockets.get(opponentSocketId); 
            if (opponentSocket) {
                opponentSocket.join(freeGameId); 
                console.log(`[ODA KONTROL]: Beyaz oyuncu (${opponentSocketId}) da aynı ${freeGameId} odasına sokuldu.`);

                activeGames[freeGameId] = {
                    isBateGame: false, 
                    whiteSocket: opponentSocketId, 
                    blackSocket: socket.id, 
                    whiteTime: duration, 
                    blackTime: duration, 
                    currentTurn: 'white', 
                    intervalId: null,
                    chessInstance: new (require('chess.js').Chess)() 
                };

                io.to(freeGameId).emit('gameStarted', {
                    opponent: opponentSocketId,
                    gameId: freeGameId,
                    duration: duration,
                    white: opponentSocketId,
                    black: socket.id
                }); 

                startServerTimer(freeGameId);
            }
            else {
                freeLobbies[duration] = socket.id; 
                socket.emit('waitingForOpponent', { message: 'Önceki rakip bağlantıyı kopardı, yeni rakip aranıyor...' }); 
                return;
            }
        }
    });

    // PARALI LOBİ DÜZELTMESİ: İki oyuncuyu kontrattakiyle aynı odaya (aynı ID'ye) sokuyoruz
    socket.on('joinPaidLobby', ({ gameId, playerAddress, duration }) => {
        console.log(`[PARALI LOBİ]: Oyuncu ${playerAddress}, katılıyor.`);
        
        // Eşleşme bekleyen biri var mı?
        if (!paidLobbies[duration]) {
            // Yoksa bu oyuncuyu bekleme havuzuna al
            paidLobbies[duration] = {
                socketId: socket.id,
                address: playerAddress,
                gameId: gameId // Kontrata giden ilk (asıl) ID
            };
            socket.join(gameId.toString()); // Soket odaları string olmalı
            socket.emit('waitingForOpponent', { message: 'Bahis yatırıldı, rakip bekleniyor...' });
        } else {
            // Bekleyen biri var! (Eşleşme sağlandı)
            const waitingPlayer = paidLobbies[duration];
            delete paidLobbies[duration]; // Havuzdan çıkar
            
            const actualGameId = waitingPlayer.gameId.toString(); 
            
            // İkinci oyuncuyu da BİRİNCİ oyuncunun odasına sokuyoruz
            socket.join(actualGameId);

            activeGames[actualGameId] = {
                isBateGame: true,
                whiteSocket: waitingPlayer.socketId,
                whiteAddress: waitingPlayer.address,
                blackSocket: socket.id,
                blackAddress: playerAddress,
                whiteTime: duration,
                blackTime: duration,
                currentTurn: 'white',
                intervalId: null,
                chessInstance: new (require('chess.js').Chess)() 
            };

            io.to(actualGameId).emit('gameStarted', {
                gameId: actualGameId,
                duration: duration,
                white: waitingPlayer.address,
                black: playerAddress
            });

            startServerTimer(actualGameId);
        }
    });

   socket.on('makeMove', ({ gameId, move }) => {
        const roomName = gameId.toString();
        let game = activeGames[roomName];
        if (!game) return;

        const moveResult = game.chessInstance.move(move);
        if (!moveResult) return; 

        game.currentTurn = game.currentTurn === 'white' ? 'black' : 'white'; 
        
        // Hamleyi rakibe gönder
        socket.to(roomName).emit('opponentMove', {
            move: moveResult,
            currentTurn: game.currentTurn
        });

        // 🌟 KESİN ÇÖZÜM: Hem eski (0.10.3) hem yeni (1.0+) sürümleri destekleyen kontrol
        const isGameOver = typeof game.chessInstance.isGameOver === 'function' 
            ? game.chessInstance.isGameOver() 
            : game.chessInstance.game_over();

        if (isGameOver) {
            const isMat = typeof game.chessInstance.isCheckmate === 'function'
                ? game.chessInstance.isCheckmate()
                : game.chessInstance.in_checkmate();

            const isDraw = typeof game.chessInstance.isDraw === 'function'
                ? (game.chessInstance.isDraw() || game.chessInstance.isStalemate())
                : (game.chessInstance.in_draw() || game.chessInstance.in_stalemate());
                
            const message = isMat ? "Şah Mat! Oyun bitti." : "Oyun bitti (Beraberlik/Pat)!";
            const winnerColor = (game.currentTurn === 'white') ? 'black' : 'white';

            if (game.intervalId) {
                clearInterval(game.intervalId);
            }
        
            console.log(`[SUNUCU HAKEM]: Oyun bitti! Kazanan: ${winnerColor}`);
            
            // Oyunculara bitiş sinyalini fırlat
            io.to(roomName).emit('gameEnded', { 
                winner: winnerColor, 
                reason: isMat ? 'checkmate' : 'draw',
                message: message 
            });

            if (game.isBateGame === true) {
                (async () => {
                    try {
                        console.log(`[WEB3 HAKEM]: Paralı oyun bitti, blockchain'e yazılıyor...`);
                        const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
                        const winnerAddress = isDraw ? ZERO_ADDRESS : ((winnerColor === 'white') ? game.whiteAddress : game.blackAddress);
                        
                        const tx = await chessContract.finalizeGame(Number(roomName), winnerAddress, isDraw);
                        await tx.wait(); 
                        console.log(`[WEB3 HAKEM]: İşlem onaylandı!`);
                    } catch (error) {
                        console.error(`[WEB3 HATA]: Blockchain işlemi başarısız oldu!`, error);
                    }
                })();
            } 

            setTimeout(() => {
                if (activeGames[roomName]) delete activeGames[roomName]; 
            }, 4000);
        }
    });
});
function startServerTimer(gameId) {
    if (!activeGames[gameId]) return; 
    const interval = setInterval(() => {
        const game = activeGames[gameId];
        if (!game) {
            clearInterval(interval); 
            return;
        }
        if (game.currentTurn === 'white') {
            game.whiteTime--;
            if (game.whiteTime <= 0) {
                clearInterval(interval);
                handleTimeout(gameId, 'black'); 
            }
        } 
        else {
            game.blackTime--;
            if (game.blackTime <= 0) {
                clearInterval(interval);
                handleTimeout(gameId, 'white'); 
            }
        }
        io.to(gameId).emit('updateTimer', {
            white: game.whiteTime, 
            black: game.blackTime
        }); 
    }, 1000);
    activeGames[gameId].intervalId = interval; 
}

async function handleTimeout(gameId, winnerColor) {
    const game = activeGames[gameId];
    if(!game) return; 
    if(game.intervalId) {
        clearInterval(game.intervalId); 
    }
    
    if (game.isBateGame === true) {
        try {
            const winnerAddress = (winnerColor === 'white') ? game.whiteAddress : game.blackAddress;
            const numericGameId = Number(gameId);
            const tx = await chessContract.finalizeGame(numericGameId, winnerAddress, false);
            await tx.wait(); 
        } catch (error) {
            console.error(`[WEB3 HATA]:`, error);
        }
    } else {
        io.to(gameId).emit('gameEnded', {
            winner: winnerColor, 
            reason: 'timeout',
            message: `Süre bitti! Kazanan: ${winnerColor === 'white' ? 'Beyaz' : 'Siyah'}`
        });
    }

    setTimeout(() => {
        if (activeGames[gameId]) {
            delete activeGames[gameId]; 
        }
    }, 4000);
} 

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor...`);
});