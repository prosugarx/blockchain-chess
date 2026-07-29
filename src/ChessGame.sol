pragma solidity ^0.8.13;

import "./ChessFactory.sol";
contract ChessGame is ChessFactory{

    struct Game
    {
        uint64 gameId;            // Benzersiz oyun ID'si
        bool isGameActive;        // Oyun hala devam ediyor mu?
        bool isRewardClaimed;     // Ödül çekildi mi? (Çifte çekim koruması)
        uint128 betAmount;        // bahis miktarı
        uint32 duration;          //Oyun oynanacak süre
        address whitePlayer;      // Oyunu kuran (Beyaz) oyuncu
        address blackPlayer;      // Odaya PIN ile giren (Siyah) rakip oyuncu  
    }
    mapping(uint64 => Game) public games;

    // Sadece BAHİSLİ oyunlar bu fonksiyonu çağıracak. Frontend bedava oyunlarda burayı tetiklemeyecek!
    function joinMoneyLobbyOrCreate(uint64 _gameId, uint32 _duration) external payable
    {
        require(msg.value == systemBetAmount, "yatirilmak istenen bahis sistem miktari ile uyusmuyor");
        // Süre kriterine göre havuz anahtarı oluşturulur (Örn: 3dk için ayrı havuz, 10dk için ayrı havuz)
        bytes32 poolKey = getPoolKey(_duration); //bytes32 poolKey = keccak256(abi.encodePacked(_duration)); her defasında bunu yazmamak için factoryde oluşturdum fonksiyon kullanıyorum burada
        WaitingPlayer memory waitingPlayer = matchmakingPool[poolKey];

        // DURUM A: Havuzda bahisli oyun bekleyen rakip yoksa (Odayı kurup bekliyoruz)
        if(waitingPlayer.playerAddress == address(0)){
            matchmakingPool[poolKey] = WaitingPlayer(msg.sender, _gameId);

            games[_gameId] = Game({ //Bizim games adında bir lügatımız (mapping) var. Kontrata diyoruz ki: "Hafızayı aç, oraya git ve bu yeni oluşturduğumuz oda numarasını (_gameId) kalıcı bir anahtar olarak kaydet." Aşağıdaki süslü parantezin içindeki her şey, bu oda numarasının altına kilitlenecek.
                gameId: _gameId,
                isGameActive: false, // Oyun şu an aktif değil, yani false. Çünkü odayı sadece 1 kişi (Beyaz) kurdu, arkadaşı henüz gelmedi. Satranç tahtasında iki kişi olmadan maç başlayamaz. Arkadaşı geldiğinde backend bunu true yapacak.
                isRewardClaimed: false, //Ortada bir ödül veya bahis olmadığı için zaten çekilecek bir para yok, bu yüzden bu koruma flag'ini de baştan kapalı (false) başlatıyoruz.
                betAmount: uint128(msg.value), //Oyun bedava olduğu için bu odanın bahis miktarını 0 Wei (0 Ether) olarak kaydediyoruz.
                whitePlayer: msg.sender, //Odayı şu an kuran, butona ilk basan kişi (msg.sender) satrançta Beyaz taşları alır. Onun cüzdan adresini odanın sahibi olarak kaydediyoruz. daha sonradan sistem siyah beyaz kafasına göre atasın.
                blackPlayer: address(0), //Burası çok önemli: Odada henüz ikinci bir oyuncu (Siyah) yok. Solidity'de boş cüzdan adresi address(0) (yani içi sıfırlarla dolu boş adres) olarak yazılır. Arkadaşı PIN kodunu girip gelene kadar Siyah oyuncu koltuğunu boş bırakıyoruz.
                duration: _duration //Oyuncunun arayüzden seçtiği oyun süresini (Örn: 10 dakika) ve kaç kişilik (Örn: 2 kişilik) olduğunu odaya kalıcı olarak kaydediyoruz ki backend sunucumuz kronometreyi buna göre başlatsın.
                //maxPlayers: _maxPlayers, şimdilik sadece 2 kişilik oyun
            });
        }
    // DURUM B: Havuzda bahisli oyun bekleyen biri zaten varmış (Eşleşme sağlandı!)
        else{
            uint64 existingGameId = waitingPlayer.gameId;
            Game storage game = games[existingGameId];
            require(game.blackPlayer == address(0), "Bu oda zaten dolu");
            game.blackPlayer = msg.sender;  // Siyah koltuğuna şu anki oyuncuyu oturt
            game.isGameActive = true;
    // Eşleşme tamamlandığı için lobideki bekleyen kaydını siliyoruz
            delete matchmakingPool[poolKey];
        }
    }

    // Sadece yetkili Node.js sunucusunun çağırabileceği oyun bitirme fonksiyonu
    function finalizeGame(uint64 _gameId, address _winner, bool _isDraw) external onlyServer //externalne oluyordu acep
    {
        // 1. ADIM: Blockchain hafızasından o anki oyunu çağırıyoruz
        Game storage game = games[_gameId];

        // 2. ADIM: Güvenlik Kontrolleri (Require)
        require(game.isGameActive, "Bu oyun aktif degil veya bitmis");
        require(!game.isRewardClaimed, "Bu oyunun odulu zaten dagitilmis");

        // 3. ADIM: Durum Güncellemeleri (Hile önleme kilidi)
        game.isGameActive = false;
        game.isRewardClaimed = true;

        // Kasada biriken toplam parayı hesapla (İki oyuncunun yatırdığı bahis miktarı)
        uint256 totalVault = game.betAmount * 2;

        // 4. ADIM: Parayı Dağıtma Mantığı
        if(_isDraw) 
        {
            // Durum A: Oyun berabere bittiyse (Süreler aynı anda bitti veya karşılıklı anlaştılar)
            // Herkes kendi yatırdığı parayı (betAmount) geri alır.
            payable(game.whitePlayer).transfer(game.betAmount);
            payable(game.blackPlayer).transfer(game.betAmount);
        }
        else
        {
            // Durum B: Bir kazanan varsa (Mat oldu veya birinin süresi bitti)
            // Gönderilen kazanan adresinin gerçekten o masadaki oyunculardan biri olduğundan emin ol
            require(_winner == game.whitePlayer || _winner == game.blackPlayer, "Gecersiz kazanan adresi");
            // Kasadaki tüm parayı kazanan oyuncunun cüzdanına gönder
            payable(_winner).transfer(totalVault);
        }
        // --- 5. ADIM: EVENT FIRLATMA (Frontend'e haber verilir) ---
        emit GameFinalized(_gameId, _winner, _isDraw);
    }
}




    
