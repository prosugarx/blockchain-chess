# blockchain-chess
it's done but not enough

index2.html / app2.js / style2.css: The core project files. These handle the full Web3 integration, MetaMask wallet connectivity, real-time Socket.io matchmaking, and smart contract interaction.

server.js: The Node.js/Socket.io backend serving as the authorized referee for matchmaking and smart contract payout triggers.

ChessGame.sol & ChessFactory.sol: The Solidity smart contracts responsible for escrowing player bets and executing automated payouts.

(Note: The files named index.html, app.js, and style.css belong to a completely separate, unrelated project and are not part of this Web3 chess application.)


During my high school years, while playing with my chess-enthusiast friends and first discovering blockchain technology, the idea of merging these two worlds sparked in my mind. When I saw the superficial and unsuccessful attempts marketed as "Chess 2" over the years, I realized that a true revolution wouldn't come from merely changing the board, but from transforming the game's core infrastructure.

Coming up with an idea is easy; the real challenge is actually building it. After 5 years of building my technical foundation, I brought this project to life. My goal wasn't just to develop another ordinary multiplayer chess game. By utilizing Web3 architecture and smart contracts, I aimed to integrate chess into a new era, decentralize the competition, and create a much more exciting, transparent, and true "Chess 2" experience for enthusiasts.


Challenge: Secure Off-Chain to On-Chain Execution & Automated Payouts
The most significant technical hurdle was securely synchronizing the off-chain game state (Node.js/Socket.io) with the on-chain smart contract. I had to ensure that the moment a checkmate occurred, the prize pool was transferred instantly, while strictly preventing malicious players from manually triggering the payout function to cheat.

Solution: I designed the Node.js backend to act as a secure, authorized "Referee" (Oracle). By engineering an onlyServer modifier within the Solidity smart contract, the core architecture dictates that only transactions signed by the server's private key can authorize the distribution of the locked ETH pool. (While I occasionally disable this modifier in the local testing environment to speed up development and wallet synchronization, this on-chain authorization remains the fundamental security architecture of the project.) Utilizing asynchronous calls with Ethers.js, the server automatically triggers the finalizeGame transaction the exact moment a win is detected via WebSockets, ensuring seamless payouts.


