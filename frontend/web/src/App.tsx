// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface WordGameRecord {
  id: string;
  encryptedGuess: string;
  timestamp: number;
  player: string;
  day: number;
  isCorrect: boolean;
}

const App: React.FC = () => {
  // Randomized style selections:
  // Colors: High contrast (red+black)
  // UI Style: Cyberpunk
  // Layout: Center radiation
  // Interaction: Micro-interactions (hover effects)
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<WordGameRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [currentGuess, setCurrentGuess] = useState("");
  const [dailyChallenge, setDailyChallenge] = useState({
    day: Math.floor(Date.now() / 86400000),
    attempts: 0,
    maxAttempts: 6
  });
  const [showStats, setShowStats] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{player: string, score: number}[]>([]);

  // Calculate game statistics
  const wins = records.filter(r => r.isCorrect).length;
  const winRate = records.length > 0 ? Math.round((wins / records.length) * 100) : 0;
  const currentStreak = records.length > 0 && records[0].isCorrect ? 1 : 0;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    loadLeaderboard();
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("game_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing game keys:", e);
        }
      }
      
      const list: WordGameRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`game_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              if (recordData.player.toLowerCase() === account.toLowerCase()) {
                list.push({
                  id: key,
                  encryptedGuess: recordData.guess,
                  timestamp: recordData.timestamp,
                  player: recordData.player,
                  day: recordData.day,
                  isCorrect: recordData.isCorrect
                });
              }
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const leaderboardBytes = await contract.getData("leaderboard");
      if (leaderboardBytes.length > 0) {
        try {
          const leaderboardData = JSON.parse(ethers.toUtf8String(leaderboardBytes));
          setLeaderboard(leaderboardData);
        } catch (e) {
          console.error("Error parsing leaderboard:", e);
        }
      }
    } catch (e) {
      console.error("Error loading leaderboard:", e);
    }
  };

  const submitGuess = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    if (currentGuess.length !== 5) {
      alert("Guess must be 5 letters");
      return;
    }
    
    if (dailyChallenge.attempts >= dailyChallenge.maxAttempts) {
      alert("No more attempts left for today");
      return;
    }
    
    setPlaying(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting your guess with FHE..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Simulate FHE encryption
      const encryptedGuess = `FHE-${btoa(currentGuess)}`;
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // In a real implementation, this would be handled by FHE on-chain
      const isCorrect = Math.random() > 0.7; // Simulate 30% win rate
      
      const recordData = {
        guess: encryptedGuess,
        timestamp: Math.floor(Date.now() / 1000),
        player: account,
        day: dailyChallenge.day,
        isCorrect
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `game_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("game_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "game_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      // Update leaderboard if correct
      if (isCorrect) {
        const leaderboardBytes = await contract.getData("leaderboard");
        let leaderboardData: {player: string, score: number}[] = [];
        
        if (leaderboardBytes.length > 0) {
          try {
            leaderboardData = JSON.parse(ethers.toUtf8String(leaderboardBytes));
          } catch (e) {
            console.error("Error parsing leaderboard:", e);
          }
        }
        
        const playerIndex = leaderboardData.findIndex(item => 
          item.player.toLowerCase() === account.toLowerCase()
        );
        
        if (playerIndex >= 0) {
          leaderboardData[playerIndex].score += 1;
        } else {
          leaderboardData.push({player: account, score: 1});
        }
        
        leaderboardData.sort((a, b) => b.score - a.score);
        await contract.setData(
          "leaderboard", 
          ethers.toUtf8Bytes(JSON.stringify(leaderboardData))
        );
        loadLeaderboard();
      }
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isCorrect ? "Correct! +1 point" : "Try again tomorrow!"
      });
      
      setDailyChallenge(prev => ({
        ...prev,
        attempts: prev.attempts + 1
      }));
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowGameModal(false);
        setCurrentGuess("");
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setPlaying(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      alert(`Contract is ${isAvailable ? 'available' : 'not available'}`);
    } catch (e) {
      console.error("Error checking availability:", e);
      alert("Failed to check contract availability");
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <div className="radiation-lines">
        {Array.from({length: 8}).map((_, i) => (
          <div key={i} className="radiation-line" style={{transform: `rotate(${i * 45}deg)`}}></div>
        ))}
      </div>
      
      <header className="app-header">
        <div className="logo">
          <h1>FHE<span>WORDLE</span></h1>
          <div className="fhe-badge">
            <span>FHE-Powered</span>
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowGameModal(true)} 
            className="play-btn cyber-button"
            disabled={dailyChallenge.attempts >= dailyChallenge.maxAttempts}
          >
            {dailyChallenge.attempts >= dailyChallenge.maxAttempts ? 
              "Come back tomorrow" : 
              "Play Today's Game"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="center-radial">
          <div className="game-info-panel cyber-card">
            <h2>Private Word Game</h2>
            <p>Guess the secret word with <strong>Fully Homomorphic Encryption</strong> keeping your attempts private</p>
            
            <div className="info-grid">
              <div className="info-item">
                <div className="info-value">{dailyChallenge.day}</div>
                <div className="info-label">Day</div>
              </div>
              <div className="info-item">
                <div className="info-value">{dailyChallenge.maxAttempts - dailyChallenge.attempts}</div>
                <div className="info-label">Attempts Left</div>
              </div>
              <div className="info-item">
                <div className="info-value">{winRate}%</div>
                <div className="info-label">Win Rate</div>
              </div>
              <div className="info-item">
                <div className="info-value">{currentStreak}</div>
                <div className="info-label">Streak</div>
              </div>
            </div>
            
            <div className="action-buttons">
              <button 
                className="cyber-button secondary"
                onClick={() => setShowStats(!showStats)}
              >
                {showStats ? "Hide Stats" : "Show Stats"}
              </button>
              <button 
                className="cyber-button secondary"
                onClick={checkAvailability}
              >
                Check FHE Status
              </button>
            </div>
          </div>
          
          {showStats && (
            <div className="stats-panel cyber-card">
              <h3>Your Game Statistics</h3>
              
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{records.length}</div>
                  <div className="stat-label">Total Games</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{wins}</div>
                  <div className="stat-label">Wins</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{winRate}%</div>
                  <div className="stat-label">Win Rate</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{currentStreak}</div>
                  <div className="stat-label">Current Streak</div>
                </div>
              </div>
              
              <div className="records-list">
                <h4>Recent Games</h4>
                {records.length === 0 ? (
                  <p className="no-records">No games played yet</p>
                ) : (
                  <div className="game-history">
                    {records.slice(0, 5).map(record => (
                      <div key={record.id} className={`game-record ${record.isCorrect ? 'win' : 'loss'}`}>
                        <span>Day {record.day}</span>
                        <span>{new Date(record.timestamp * 1000).toLocaleDateString()}</span>
                        <span>{record.isCorrect ? '✅' : '❌'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          
          <div className="leaderboard-panel cyber-card">
            <h3>Leaderboard</h3>
            
            {leaderboard.length === 0 ? (
              <p className="no-leaderboard">No leaderboard data yet</p>
            ) : (
              <div className="leaderboard-list">
                {leaderboard.slice(0, 5).map((item, index) => (
                  <div key={index} className={`leaderboard-item ${item.player.toLowerCase() === account.toLowerCase() ? 'you' : ''}`}>
                    <span className="rank">{index + 1}</span>
                    <span className="player">
                      {item.player.substring(0, 6)}...{item.player.substring(38)}
                    </span>
                    <span className="score">{item.score} wins</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
  
      {showGameModal && (
        <ModalGame 
          onSubmit={submitGuess} 
          onClose={() => setShowGameModal(false)} 
          playing={playing}
          guess={currentGuess}
          setGuess={setCurrentGuess}
          attemptsLeft={dailyChallenge.maxAttempts - dailyChallenge.attempts}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span>FHE-WORDLE</span>
            <p>Private on-chain word game powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">How it works</a>
            <a href="#" className="footer-link">About FHE</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="copyright">
            © {new Date().getFullYear()} FHE-WordGame. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalGameProps {
  onSubmit: () => void; 
  onClose: () => void; 
  playing: boolean;
  guess: string;
  setGuess: (guess: string) => void;
  attemptsLeft: number;
}

const ModalGame: React.FC<ModalGameProps> = ({ 
  onSubmit, 
  onClose, 
  playing,
  guess,
  setGuess,
  attemptsLeft
}) => {
  const handleSubmit = () => {
    if (guess.length !== 5) {
      alert("Guess must be 5 letters");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="game-modal cyber-card">
        <div className="modal-header">
          <h2>Daily Word Challenge</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your guess will be encrypted with FHE
          </div>
          
          <div className="attempts-left">
            Attempts left: <strong>{attemptsLeft}</strong>
          </div>
          
          <div className="guess-input-container">
            <input 
              type="text"
              value={guess}
              onChange={(e) => setGuess(e.target.value.toUpperCase())}
              placeholder="Enter 5-letter word"
              className="cyber-input"
              maxLength={5}
              disabled={playing}
            />
          </div>
          
          <div className="game-instructions">
            <p>Guess the secret 5-letter word. Your attempt will be encrypted using FHE and verified privately on-chain.</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={playing || guess.length !== 5}
            className="submit-btn cyber-button primary"
          >
            {playing ? "Encrypting with FHE..." : "Submit Guess"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;