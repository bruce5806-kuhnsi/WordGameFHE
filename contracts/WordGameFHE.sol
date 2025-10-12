// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract WordGameFHE is SepoliaConfig {
    struct EncryptedGuess {
        euint32[5] letters; // Encrypted letters of the guess
        uint256 timestamp;
        address player;
    }

    struct EncryptedAnswer {
        euint32[5] letters; // Encrypted letters of the answer
        uint256 day;
    }

    struct PlayerStats {
        uint256 wins;
        uint256 attempts;
        uint256 lastPlayedDay;
    }

    // Current encrypted answer
    EncryptedAnswer private currentAnswer;
    
    // Mapping of player guesses
    mapping(uint256 => EncryptedGuess) private guesses;
    uint256 private guessCount;
    
    // Player statistics
    mapping(address => PlayerStats) private playerStats;
    
    // Daily leaderboard
    mapping(uint256 => address[]) private dailyWinners;
    
    // Events
    event GuessSubmitted(uint256 indexed guessId, address indexed player);
    event GuessEvaluated(uint256 indexed guessId, address indexed player, bool isCorrect);
    event NewDailyAnswer(uint256 day);
    
    // Modifier to ensure answer is set
    modifier answerExists() {
        require(currentAnswer.day != 0, "Answer not set");
        _;
    }

    /// @notice Set the encrypted daily answer (admin function)
    function setDailyAnswer(euint32[5] memory encryptedLetters) public {
        currentAnswer = EncryptedAnswer({
            letters: encryptedLetters,
            day: block.timestamp / 1 days
        });
        emit NewDailyAnswer(currentAnswer.day);
    }

    /// @notice Submit an encrypted word guess
    function submitGuess(euint32[5] memory encryptedLetters) public answerExists {
        uint256 currentDay = block.timestamp / 1 days;
        require(currentDay == currentAnswer.day, "Not current day");
        require(playerStats[msg.sender].lastPlayedDay < currentDay, "Already played today");

        guessCount++;
        guesses[guessCount] = EncryptedGuess({
            letters: encryptedLetters,
            timestamp: block.timestamp,
            player: msg.sender
        });

        playerStats[msg.sender].lastPlayedDay = currentDay;
        playerStats[msg.sender].attempts++;

        emit GuessSubmitted(guessCount, msg.sender);
    }

    /// @notice Evaluate a guess against the answer
    function evaluateGuess(uint256 guessId) public answerExists {
        EncryptedGuess storage guess = guesses[guessId];
        require(guess.player == msg.sender, "Not your guess");
        require(guess.timestamp != 0, "Invalid guess");

        ebool isCorrect = FHE.asEbool(true);
        for (uint i = 0; i < 5; i++) {
            isCorrect = FHE.and(isCorrect, FHE.eq(guess.letters[i], currentAnswer.letters[i]));
        }

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(isCorrect);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.handleEvaluationResult.selector);
        requestToGuessId[reqId] = guessId;
    }

    /// @notice Callback for decrypted evaluation result
    function handleEvaluationResult(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 guessId = requestToGuessId[requestId];
        EncryptedGuess storage guess = guesses[guessId];
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        bool isCorrect = abi.decode(cleartexts, (bool));
        
        if (isCorrect) {
            playerStats[guess.player].wins++;
            dailyWinners[currentAnswer.day].push(guess.player);
        }

        emit GuessEvaluated(guessId, guess.player, isCorrect);
    }

    /// @notice Get player statistics
    function getPlayerStats(address player) public view returns (uint256 wins, uint256 attempts) {
        return (playerStats[player].wins, playerStats[player].attempts);
    }

    /// @notice Get daily winners
    function getDailyWinners(uint256 day) public view returns (address[] memory) {
        return dailyWinners[day];
    }

    /// @notice Get current game day
    function getCurrentDay() public view returns (uint256) {
        return currentAnswer.day;
    }

    // Helper mapping for decryption requests
    mapping(uint256 => uint256) private requestToGuessId;
}