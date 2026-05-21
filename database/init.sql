-- Create Database
CREATE DATABASE IF NOT EXISTS worldcup_betting;
USE worldcup_betting;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matches Table
CREATE TABLE IF NOT EXISTS matches (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_a VARCHAR(50) NOT NULL,
    team_b VARCHAR(50) NOT NULL,
    match_date DATETIME NOT NULL,
    status ENUM('pending', 'completed') DEFAULT 'pending',
    score_a INT DEFAULT NULL,
    score_b INT DEFAULT NULL
);

-- Bets Table
CREATE TABLE IF NOT EXISTS bets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    match_id INT NOT NULL,
    predicted_score_a INT NOT NULL,
    predicted_score_b INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (match_id) REFERENCES matches(id)
);

-- Insert Sample Matches for 2026 World Cup
INSERT INTO matches (team_a, team_b, match_date, status) VALUES
('Canada', 'Brazil', '2026-06-11 15:00:00', 'pending'),
('Mexico', 'Germany', '2026-06-12 18:00:00', 'pending'),
('USA', 'England', '2026-06-13 20:00:00', 'pending'),
('Argentina', 'Spain', '2026-06-14 16:00:00', 'pending'),
('France', 'Portugal', '2026-06-15 14:00:00', 'pending');
