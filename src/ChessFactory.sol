pragma solidity ^0.8.13;
//Bu dosyada sadece sistemin ayarları, oda şablonları ve 
//kontratın sahibi (Owner) gibi temel yönetimsel yapılar yer alır.

contract ChessFactory {
    address public owner;           // Akıllı sözleşmeyi kontrol eden yönetici (Sen)
    uint128 public systemBetAmount; // Örnek: Sistem sabit bahis miktarı
    address public serverAddress;   // Hakemlik yapacak Node.js backend sunucunun cüzdanı

    // Bekleyen oyuncu bilgisi
    struct WaitingPlayer {
        address playerAddress;  // Bekleyen oyuncunun cüzdanı
        uint64 gameId;          // Oyuncunun kurduğu veya beklediği oyun ID'si
    }

    // Kriterlerin benzersiz karmasına (hash) göre bekleyen oyuncuları tutan havuz
    // Örn: keccak256(300, 2, true) -> Bekleyen Oyuncu
    mapping(bytes32 => WaitingPlayer) public matchmakingPool;

    // Sadece senin (Owner) çağırabileceğin fonksiyonlar için güvenlik kilidi
    modifier onlyOwner() {
        require(msg.sender == owner, "Sadece sahip yapabilir.");
        _;
    }

    modifier onlyServer() {
    require(msg.sender == serverAddress, "Sadece hakem sunucu cuzdani cagirabilir!");
    _;
    }
    // Node.js backend sunucunu kurduğunda onun cüzdan adresini sisteme kaydetmek için
    function setServerAddress(address _newServer) external onlyOwner {
    serverAddress = _newServer;
    }

    // Kontrat ilk deploy edildiğinde tetiklenen kurucu fonksiyon
    constructor() {
        owner = msg.sender;             // Kontratı deploy eden ilk cüzdan sahibi olur
        serverAddress = msg.sender;     // Başlangıçta sunucuyu da sahibi yapıyoruz (Sonra güncellenebilir)
        systemBetAmount = 0.05 ether;   // Varsayılan sabit bahis miktarı: 0.05 ETH (Anvil'de test için ideal)
    }

    // İleride sistemin bahis miktarını değiştirmek isterseniz
    function setSystemBetAmount(uint128 _newAmount) external onlyOwner {
        systemBetAmount = _newAmount;
    }

    // Oyuncunun seçtiği süreye göre benzersiz bir lobi kutu anahtarı üretir
    function getPoolKey(uint32 _duration) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_duration));
    }
}    

