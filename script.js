// 1. Khởi tạo: Biến trạng thái và hằng số
const gameState = {
    board: [],
    words: [],
    foundWords: [],
    placedWords: [],
    boardSize: 15,
    timer: null,
    timeLeft: 300,
    isGameStarted: false,
    englishWords: [],
    targetWords: 0,
    clues: [],
    algorithm: 'dfs',
    algorithmStats: { nodesVisited: 0, timeTaken: 0, pathLength: 0 },
    clueCache: new Map(),
    hintedWords: new Set()
};
let selectedCells = []; // Mảng lưu các ô được chọn

const colors = [
    '#81c784', '#ff5555', '#ffaa00', '#55aaff', '#ff55ff', '#55ff55',
    '#aa55ff', '#ffaa55', '#55ffff', '#ff55aa', '#aaff55', '#ff5555',
    '#55aa55', '#aa55aa', '#aaaa55'
];

const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
];

const boardElement = document.getElementById('game-board');
const wordInputElement = document.getElementById('word-input');
const startGameButton = document.getElementById('start-game');
const newGameButton = document.getElementById('new-game');
const hintButton = document.getElementById('hint-button');
const deleteButton = document.getElementById('delete-word');
const boardSizeSelect = document.getElementById('board-size');
const difficultySelect = document.getElementById('difficulty');
const algorithmSelect = document.getElementById('algorithm');
const timeLimitInput = document.getElementById('time-limit');
const timerElement = document.getElementById('timer');
const wordsFoundElement = document.getElementById('words-found');
const foundWordsList = document.getElementById('found-words-list');
const notFoundWordsList = document.getElementById('not-found-words-list');
const cluesList = document.getElementById('clues-list');
const algorithmStatsElement = document.getElementById('algorithm-stats');

// 2. Tải từ điển và lấy gợi ý từ API
async function loadEnglishWords() {
    try {
        const response = await fetch('dictionary.json');
        const data = await response.json();
        gameState.englishWords = data;
        console.log(`Loaded ${gameState.englishWords.length} words.`);
    } catch (error) {
        console.error('Error loading words:', error);
        alert('Failed to load word list. Please check if dictionary.json exists.');
    }
}

async function fetchClue(word) {
    if (gameState.clueCache.has(word)) {
        return gameState.clueCache.get(word);
    }
    try {
        const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word.toLowerCase()}`);
        const data = await response.json();
        let clue = `A ${word.length}-letter word starting with ${word[0]}`;
        if (data && data[0] && data[0].meanings && data[0].meanings[0] && data[0].meanings[0].definitions) {
            clue = data[0].meanings[0].definitions[0].definition;
        }
        gameState.clueCache.set(word, clue);
        return clue;
    } catch (error) {
        console.error(`Error fetching clue for ${word}:`, error);
        const clue = `A ${word.length}-letter word starting with ${word[0]}`;
        gameState.clueCache.set(word, clue);
        return clue;
    }
}

async function loadClues(words) {
    gameState.clues = [];
    for (const word of words) {
        const clue = await fetchClue(word);
        gameState.clues.push({ word, clue });
    }
    renderClues();
}

function renderClues() {
    cluesList.innerHTML = '';
    gameState.clues.forEach(({ word, clue }) => {
        const isFound = gameState.foundWords.some(entry => entry.word === word);
        const isHinted = gameState.hintedWords.has(word);
        if (!isFound && isHinted) {
            const listItem = document.createElement('li');
            listItem.className = 'clue-item';
            listItem.textContent = clue;
            cluesList.appendChild(listItem);
        }
    });
}

// 3. Chọn từ ngẫu nhiên
function selectRandomWords(difficulty) {
    const shuffled = [...gameState.englishWords].sort(() => 0.5 - Math.random());
    let count;
    switch(difficulty) {
        case 'easy': count = 5; break;
        case 'hard': count = 15; break;
        case 'medium': default: count = 10; break;
    }
    const selectedWords = shuffled.slice(0, count).sort((a, b) => a.length - b.length);
    gameState.targetWords = count;
    console.log("Difficulty:", difficulty, "Number of words:", selectedWords.length, "Words:", selectedWords);
    return selectedWords;
}

// 4. Tạo lưới ô chữ
function generateBoard(size, words) {
    console.time('generateBoard');
    const board = Array(size).fill().map(() => Array(size).fill(''));
    gameState.placedWords = [];
    const usedCells = new Set();
    const maxAttemptsPerWord = 15;
    const sortedWords = [...words].sort((a, b) => b.length - a.length);
    const positions = [];
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            positions.push([row, col]);
        }
    }
    sortedWords.forEach(word => {
        let placed = false;
        let attempt = 0;
        while (!placed && attempt < maxAttemptsPerWord) {
            attempt++;
            for (let i = positions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [positions[i], positions[j]] = [positions[j], positions[i]];
            }
            let bestPlacement = null;
            let minConflicts = Infinity;
            const shuffledDirections = [...directions].sort(() => 0.5 - Math.random());
            positions.forEach(([row, col]) => {
                shuffledDirections.forEach(([dx, dy]) => {
                    if (canPlaceWord(board, word, row, col, dx, dy, size, usedCells)) {
                        const conflicts = countConflicts(board, word, row, col, dx, dy);
                        if (conflicts < minConflicts) {
                            minConflicts = conflicts;
                            bestPlacement = { row, col, dx, dy };
                        }
                    }
                });
            });
            if (bestPlacement) {
                const { row, col, dx, dy } = bestPlacement;
                const path = [];
                for (let i = 0; i < word.length; i++) {
                    const r = row + i * dx;
                    const c = col + i * dy;
                    board[r][c] = word[i];
                    usedCells.add(`${r},${c}`);
                    path.push([r, c]);
                }
                gameState.placedWords.push({
                    word,
                    start: [row, col],
                    end: [row + (word.length - 1) * dx, col + (word.length - 1) * dy],
                    direction: [dx, dy]
                });
                console.log(`Placed word: ${word} at (${row},${col}) direction (${dx},${dy})`);
                placed = true;
            }
        }
        if (!placed) {
            console.log(`Could not place word: ${word} after ${maxAttemptsPerWord} attempts`);
        }
    });
    const latinChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (board[row][col] === '') {
                board[row][col] = latinChars.charAt(Math.floor(Math.random() * latinChars.length));
            }
        }
    }
    console.log("Placed words in the grid:", gameState.placedWords);
    printBoard(board);
    gameState.placedWords = gameState.placedWords.filter(({ word }) => {
        const result = findWordDFS(board, word);
        if (!result.found) {
            console.error(`Verification failed: "${word}" was placed but cannot be found in the grid!`);
            return false;
        }
        console.log(`Verified word: ${word} at path:`, result.path);
        return true;
    });
    gameState.targetWords = gameState.placedWords.length;
    console.log("Verified placed words:", gameState.placedWords);
    console.timeEnd('generateBoard');
    console.log(`Successfully placed ${gameState.placedWords.length} out of ${words.length} words`);
    return board;
}

function canPlaceWord(board, word, startRow, startCol, dx, dy, size, usedCells) {
    for (let i = 0; i < word.length; i++) {
        const row = startRow + i * dx;
        const col = startCol + i * dy;
        if (row < 0 || row >= size || col < 0 || col >= size) {
            return false;
        }
        const cellKey = `${row},${col}`;
        if (usedCells.has(cellKey) && board[row][col] !== word[i]) {
            return false;
        }
    }
    return true;
}

function countConflicts(board, word, startRow, startCol, dx, dy) {
    let conflicts = 0;
    let overlaps = 0;
    for (let i = 0; i < word.length; i++) {
        const row = startRow + i * dx;
        const col = startCol + i * dy;
        if (board[row][col] !== '') {
            if (board[row][col] !== word[i]) {
                conflicts++;
            } else {
                overlaps++;
            }
        }
    }
    return conflicts - overlaps * 0.8;
}

function printBoard(board) {
    console.log("Current Grid:");
    const header = "   " + [...Array(board[0].length).keys()].map(i => String(i).padStart(2, ' ')).join(' ');
    console.log(header);
    board.forEach((row, idx) => {
        console.log(String(idx).padStart(2, ' ') + ' ' + row.join('  '));
    });
}

// 5. Hiển thị lưới ô chữ
function renderBoard(board) {
    boardElement.innerHTML = '';
    boardElement.style.gridTemplateColumns = `repeat(${board.length}, 30px)`;
    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board.length; col++) {
            const cell = document.createElement('div');
            cell.className = 'board-cell';
            cell.textContent = board[row][col];
            cell.dataset.row = row;
            cell.dataset.col = col;
            cell.addEventListener('click', () => handleCellClick(row, col));
            boardElement.appendChild(cell);
        }
    }
}

// 6. Xử lý chọn ô bằng chuột
function handleCellClick(row, col) {
    if (!gameState.isGameStarted) return;
    const cell = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    const cellIndex = selectedCells.findIndex(c => c.row === row && c.col === col);

    if (cellIndex === -1) {
        selectedCells.push({ row, col });
        cell.classList.add('selected');
    } else {
        selectedCells.splice(cellIndex, 1);
        cell.classList.remove('selected');
    }

    // Cập nhật ô nhập với từ được chọn
    wordInputElement.value = selectedCells.map(c => gameState.board[c.row][c.col]).join('');
}

// 7. Xử lý nhập từ: Tìm từ bằng DFS, BFS hoặc A*
function findWord(board, word) {
    gameState.algorithmStats = { nodesVisited: 0, timeTaken: 0, pathLength: 0 };
    const startTime = performance.now();
    let result;
    if (gameState.algorithm === 'dfs') {
        result = findWordDFS(board, word);
    } else if (gameState.algorithm === 'bfs') {
        result = findWordBFS(board, word);
    } else if (gameState.algorithm === 'a*') {
        result = findWordAStar(board, word);
    }
    gameState.algorithmStats.timeTaken = performance.now() - startTime;
    if (result.found) {
        gameState.algorithmStats.pathLength = result.path.length;
    }
    updateAlgorithmStats();
    return result;
}

function findWordDFS(board, word) {
    const boardSize = board.length;
    const visited = Array(boardSize).fill().map(() => Array(boardSize).fill(false));
    const path = [];
    console.log(`Searching for "${word}" in the grid using DFS...`);
    for (let row = 0; row < boardSize; row++) {
        for (let col = 0; col < boardSize; col++) {
            if (board[row][col] === word[0]) {
                path.length = 0;
                gameState.algorithmStats.nodesVisited = 0;
                const found = dfs(row, col, 0);
                if (found && isValidPath(path)) {
                    console.log(`Found "${word}" at path:`, path);
                    return { found: true, path: path.slice() };
                }
            }
        }
    }
    console.log(`Could not find "${word}" in the grid.`);
    printBoard(board);
    return { found: false, path: [] };

    function dfs(row, col, index) {
        gameState.algorithmStats.nodesVisited++;
        if (index === word.length) return true;
        if (row < 0 || row >= boardSize || col < 0 || col >= boardSize || 
            visited[row][col] || board[row][col] !== word[index]) return false;
        
        visited[row][col] = true;
        path.push([row, col]);
        
        for (const [dx, dy] of directions) {
            const newRow = row + dx;
            const newCol = col + dy;
            if (dfs(newRow, newCol, index + 1)) return true;
        }
        
        visited[row][col] = false;
        path.pop();
        return false;
    }

    function isValidPath(path) {
        if (path.length < 2) return true;
        const [startRow, startCol] = path[0];
        const [endRow, endCol] = path[path.length - 1];
        const dx = endRow - startRow;
        const dy = endCol - startCol;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        
        if (steps === 0) return path.length === 1;
        if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return false;
        
        const stepX = dx === 0 ? 0 : dx / steps;
        const stepY = dy === 0 ? 0 : dy / steps;
        
        for (let i = 1; i < path.length; i++) {
            const expectedRow = Math.round(startRow + i * stepX);
            const expectedCol = Math.round(startCol + i * stepY);
            const [actualRow, actualCol] = path[i];
            if (actualRow !== expectedRow || actualCol !== expectedCol) return false;
        }
        return true;
    }
}

function findWordBFS(board, word) {
    const boardSize = board.length;
    const queue = [];
    const visited = new Set();
    const parent = new Map();
    let found = false;
    let endPos = null;

    console.log(`Searching for "${word}" in the grid using BFS...`);
    for (let row = 0; row < boardSize && !found; row++) {
        for (let col = 0; col < boardSize && !found; col++) {
            if (board[row][col] === word[0]) {
                queue.push({ row, col, index: 0 });
                visited.add(`${row},${col},0`);
                parent.set(`${row},${col},0`, null);
                while (queue.length > 0 && !found) {
                    gameState.algorithmStats.nodesVisited++;
                    const { row, col, index } = queue.shift();
                    if (index + 1 === word.length) {
                        found = true;
                        endPos = [row, col];
                        break;
                    }
                    for (const [dx, dy] of directions) {
                        const newRow = row + dx;
                        const newCol = col + dy;
                        const newIndex = index + 1;
                        if (newRow >= 0 && newRow < boardSize && newCol >= 0 && newCol < boardSize &&
                            !visited.has(`${newRow},${newCol},${newIndex}`) &&
                            board[newRow][newCol] === word[newIndex]) {
                            queue.push({ row: newRow, col: newCol, index: newIndex });
                            visited.add(`${newRow},${newCol},${newIndex}`);
                            parent.set(`${newRow},${newCol},${newIndex}`, { row, col, index });
                        }
                    }
                }
                if (found) break;
                queue.length = 0;
                visited.clear();
                parent.clear();
            }
        }
    }

    if (!found) {
        console.log(`Could not find "${word}" in the grid.`);
        return { found: false, path: [] };
    }

    const path = [];
    let current = endPos;
    let index = word.length - 1;
    while (current) {
        path.unshift([current[0], current[1]]);
        const key = `${current[0]},${current[1]},${index}`;
        const prev = parent.get(key);
        if (!prev) break;
        current = [prev.row, prev.col];
        index--;
    }

    if (isValidPath(path)) {
        console.log(`Found "${word}" at path:`, path);
        return { found: true, path };
    }
    console.log(`Invalid path for "${word}".`);
    return { found: false, path: [] };

    function isValidPath(path) {
        if (path.length < 2) return true;
        const [startRow, startCol] = path[0];
        const [endRow, endCol] = path[path.length - 1];
        const dx = endRow - startRow;
        const dy = endCol - startCol;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        
        if (steps === 0) return path.length === 1;
        if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return false;
        
        const stepX = dx === 0 ? 0 : dx / steps;
        const stepY = dy === 0 ? 0 : dy / steps;
        
        for (let i = 1; i < path.length; i++) {
            const expectedRow = Math.round(startRow + i * stepX);
            const expectedCol = Math.round(startCol + i * stepY);
            const [actualRow, actualCol] = path[i];
            if (actualRow !== expectedRow || actualCol !== expectedCol) return false;
        }
        return true;
    }
}

function findWordAStar(board, word) {
    const boardSize = board.length;
    const openSet = new Map();
    const closedSet = new Set();
    const gScore = new Map();
    const fScore = new Map();
    const parent = new Map();
    let found = false;
    let endPos = null;

    console.log(`Searching for "${word}" in the grid using A*...`);
    for (let row = 0; row < boardSize && !found; row++) {
        for (let col = 0; col < boardSize && !found; col++) {
            if (board[row][col] === word[0]) {
                const startKey = `${row},${col},0`;
                gScore.set(startKey, 0);
                fScore.set(startKey, 0);
                openSet.set(startKey, { row, col, index: 0 });
                parent.set(startKey, null);

                while (openSet.size > 0 && !found) {
                    gameState.algorithmStats.nodesVisited++;
                    let currentKey = null;
                    let lowestF = Infinity;
                    for (const [key, node] of openSet) {
                        const f = fScore.get(key);
                        if (f < lowestF) {
                            lowestF = f;
                            currentKey = key;
                        }
                    }

                    const current = openSet.get(currentKey);
                    openSet.delete(currentKey);
                    closedSet.add(currentKey);

                    const { row, col, index } = current;
                    if (index + 1 === word.length) {
                        found = true;
                        endPos = [row, col];
                        break;
                    }

                    for (const [dx, dy] of directions) {
                        const newRow = row + dx;
                        const newCol = col + dy;
                        const newIndex = index + 1;
                        if (newRow < 0 || newRow >= boardSize || newCol < 0 || newCol >= boardSize ||
                            board[newRow][newCol] !== word[newIndex]) continue;

                        const newKey = `${newRow},${newCol},${newIndex}`;
                        if (closedSet.has(newKey)) continue;

                        const tentativeG = gScore.get(currentKey) + 1;
                        if (!openSet.has(newKey)) {
                            openSet.set(newKey, { row: newRow, col: newCol, index: newIndex });
                        } else if (tentativeG >= (gScore.get(newKey) || Infinity)) {
                            continue;
                        }

                        parent.set(newKey, { row, col, index });
                        gScore.set(newKey, tentativeG);
                        const h = Math.abs(dx) + Math.abs(dy);
                        fScore.set(newKey, tentativeG + h);
                    }
                }

                if (found) break;
                openSet.clear();
                closedSet.clear();
                gScore.clear();
                fScore.clear();
                parent.clear();
            }
        }
    }

    if (!found) {
        console.log(`Could not find "${word}" in the grid.`);
        return { found: false, path: [] };
    }

    const path = [];
    let current = endPos;
    let index = word.length - 1;
    while (current) {
        path.unshift([current[0], current[1]]);
        const key = `${current[0]},${current[1]},${index}`;
        const prev = parent.get(key);
        if (!prev) break;
        current = [prev.row, prev.col];
        index--;
    }

    if (isValidPath(path)) {
        console.log(`Found "${word}" at path:`, path);
        return { found: true, path };
    }
    console.log(`Invalid path for "${word}".`);
    return { found: false, path: [] };

    function isValidPath(path) {
        if (path.length < 2) return true;
        const [startRow, startCol] = path[0];
        const [endRow, endCol] = path[path.length - 1];
        const dx = endRow - startRow;
        const dy = endCol - startCol;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        
        if (steps === 0) return path.length === 1;
        if (dx !== 0 && dy !== 0 && Math.abs(dx) !== Math.abs(dy)) return false;
        
        const stepX = dx === 0 ? 0 : dx / steps;
        const stepY = dy === 0 ? 0 : dy / steps;
        
        for (let i = 1; i < path.length; i++) {
            const expectedRow = Math.round(startRow + i * stepX);
            const expectedCol = Math.round(startCol + i * stepY);
            const [actualRow, actualCol] = path[i];
            if (actualRow !== expectedRow || actualCol !== expectedCol) return false;
        }
        return true;
    }
}

function updateAlgorithmStats() {
    if (!gameState.isGameStarted) {
        algorithmStatsElement.textContent = "Algorithm Stats: Waiting to start...";
    } else {
        algorithmStatsElement.textContent = `Algorithm Stats: ${gameState.algorithm.toUpperCase()}, Nodes Visited: ${gameState.algorithmStats.nodesVisited}, Time: ${gameState.algorithmStats.timeTaken.toFixed(2)}ms, Path Length: ${gameState.algorithmStats.pathLength}`;
    }
}

async function markWordAsFound(word, path) {
    const colorIndex = gameState.foundWords.length % colors.length;
    const wordColor = colors[colorIndex];
    path.forEach(([row, col]) => {
        const cell = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (cell && !cell.style.backgroundColor) {
            cell.style.backgroundColor = wordColor;
            cell.style.color = 'white';
            cell.classList.remove('selected'); // Bỏ chọn ô
        }
    });
    gameState.foundWords.push({ word, path, color: wordColor });
    wordsFoundElement.textContent = `${gameState.foundWords.length}/${gameState.placedWords.length}`;
    
    const listItem = document.createElement('li');
    const colorIndicator = document.createElement('span');
    colorIndicator.className = 'color-indicator';
    colorIndicator.style.backgroundColor = wordColor;
    listItem.appendChild(colorIndicator);
    listItem.appendChild(document.createTextNode(`${word}: (${path[0][0]},${path[0][1]}) -> (${path[path.length-1][0]},${path[path.length-1][1]})`));
    foundWordsList.appendChild(listItem);

    const clueEntry = gameState.clues.find(entry => entry.word === word);
    if (clueEntry) {
        alert(`Found "${word}"! Clue: ${clueEntry.clue}`);
    }
    renderClues();
    selectedCells = []; // Xóa các ô đã chọn
    wordInputElement.value = ''; // Xóa ô nhập
    if (gameState.foundWords.length === gameState.placedWords.length) {
        endGame(true);
    }
}

// 8. Gợi ý thông minh
function provideHint() {
    if (!gameState.isGameStarted) {
        alert('Please start the game first!');
        return;
    }
    const foundWordsSet = new Set(gameState.foundWords.map(entry => entry.word));
    const notFoundWords = gameState.placedWords.filter(({ word }) => !foundWordsSet.has(word));
    if (notFoundWords.length === 0) {
        alert('No words left to hint! You have found all words.');
        return;
    }
    const unhintedWords = notFoundWords.filter(({ word }) => !gameState.hintedWords.has(word));
    if (unhintedWords.length === 0) {
        alert('All remaining words have been hinted!');
        return;
    }
    const randomIndex = Math.floor(Math.random() * unhintedWords.length);
    const { word, start } = unhintedWords[randomIndex];
    const [startRow, startCol] = start;
    const cell = boardElement.querySelector(`[data-row="${startRow}"][data-col="${startCol}"]`);
    if (cell && !cell.style.backgroundColor) {
        cell.classList.add('hint');
    }
    const clueEntry = gameState.clues.find(entry => entry.word === word);
    gameState.hintedWords.add(word);
    renderClues();
    alert(`Hint: A word starts with "${word[0]}" at position (${startRow}, ${startCol}). Clue: ${clueEntry ? clueEntry.clue : 'No clue available'}`);
}

// 9. Quản lý thời gian
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (gameState.timer) {
        clearInterval(gameState.timer);
    }
    gameState.timer = setInterval(() => {
        gameState.timeLeft--;
        timerElement.textContent = formatTime(gameState.timeLeft);
        if (gameState.timeLeft <= 0) {
            endGame(false);
        }
    }, 1000);
}

// 10. Kết thúc trò chơi
function endGame(win) {
    clearInterval(gameState.timer);
    gameState.isGameStarted = false;
    wordInputElement.disabled = true;
    hintButton.disabled = true;
    deleteButton.disabled = true;
    startGameButton.disabled = false;
    newGameButton.disabled = false;

    if (!win) {
        console.log("Game ended due to timeout. Displaying not found words...");
        markNotFoundWords();
        alert('Time’s up! Check the "Words Not Found" list below.');
    } else {
        alert('Congratulations! You found all words and won the game!');
    }

    gameState.foundWords = [];
    gameState.placedWords = [];
    gameState.clues = [];
    gameState.hintedWords.clear();
    foundWordsList.innerHTML = '';
    notFoundWordsList.innerHTML = '';
    cluesList.innerHTML = '';
    wordsFoundElement.textContent = `0/${gameState.targetWords}`;
    timerElement.textContent = formatTime(parseInt(timeLimitInput.value) * 60);
    algorithmStatsElement.textContent = 'Algorithm Stats: Waiting to start...';
}

function markNotFoundWords() {
    console.log("Marking not found words...");
    console.log("Current game state before marking:", {
        placedWords: gameState.placedWords,
        foundWords: gameState.foundWords,
        board: gameState.board
    });

    const foundWordsSet = new Set(gameState.foundWords.map(entry => entry.word));
    console.log("Found words set:", Array.from(foundWordsSet));

    const notFoundWords = gameState.placedWords.filter(({ word }) => !foundWordsSet.has(word));
    console.log("Not found words to display:", notFoundWords);

    notFoundWordsList.innerHTML = '';
    if (notFoundWords.length === 0) {
        console.log("No words left to mark as not found.");
        const listItem = document.createElement('li');
        listItem.textContent = "All words were found!";
        notFoundWordsList.appendChild(listItem);
    } else {
        notFoundWords.forEach(({ word, start, end }) => {
            console.log(`Adding not found word to list: ${word}`);
            const listItem = document.createElement('li');
            const colorIndicator = document.createElement('span');
            colorIndicator.className = 'color-indicator';
            colorIndicator.style.backgroundColor = '#808080';
            listItem.appendChild(colorIndicator);
            listItem.appendChild(document.createTextNode(`${word}: (${start[0]},${start[1]}) -> (${end[0]},${end[1]})`));
            notFoundWordsList.appendChild(listItem);

            const dx = (end[0] - start[0]) / (word.length - 1 || 1);
            const dy = (end[1] - start[1]) / (word.length - 1 || 1);
            for (let i = 0; i < word.length; i++) {
                const row = start[0] + i * dx;
                const col = start[1] + i * dy;
                const cell = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                if (cell && !cell.style.backgroundColor) {
                    cell.style.backgroundColor = '#808080';
                    cell.style.color = 'white';
                }
            }
        });
    }

    notFoundWordsList.style.display = 'block';
    console.log("Not found words list updated. HTML content:", notFoundWordsList.innerHTML);
}

// 11. Sự kiện
newGameButton.addEventListener('click', () => {
    clearInterval(gameState.timer);
    gameState.isGameStarted = false;
    wordInputElement.disabled = true;
    hintButton.disabled = true;
    deleteButton.disabled = true;
    startGameButton.disabled = false;
    newGameButton.disabled = true;
    gameState.foundWords = [];
    gameState.placedWords = [];
    gameState.clues = [];
    gameState.hintedWords.clear();
    foundWordsList.innerHTML = '';
    notFoundWordsList.innerHTML = '';
    cluesList.innerHTML = '';
    wordsFoundElement.textContent = `0/${gameState.targetWords}`;
    timerElement.textContent = formatTime(parseInt(timeLimitInput.value) * 60);
    algorithmStatsElement.textContent = 'Algorithm Stats: Waiting to start...';
    selectedCells = [];
    wordInputElement.value = '';
});

startGameButton.addEventListener('click', async () => {
    if (gameState.englishWords.length === 0) {
        await loadEnglishWords();
    }
    if (gameState.englishWords.length === 0) {
        alert('Failed to load dictionary. Please check dictionary.json.');
        return;
    }
    const size = parseInt(boardSizeSelect.value);
    const difficulty = difficultySelect.value;
    const timeLimit = parseInt(timeLimitInput.value) * 60;
    gameState.boardSize = size;
    gameState.timeLeft = timeLimit;
    gameState.foundWords = [];
    gameState.placedWords = [];
    gameState.clues = [];
    gameState.hintedWords.clear();
    gameState.isGameStarted = true;
    gameState.algorithm = algorithmSelect.value;
    gameState.words = selectRandomWords(difficulty);
    await loadClues(gameState.words);
    gameState.board = generateBoard(size, gameState.words);
    if (gameState.placedWords.length === 0) {
        alert('Failed to generate board with words. Please try again.');
        endGame(false);
        return;
    }
    renderBoard(gameState.board);
    foundWordsList.innerHTML = '';
    notFoundWordsList.innerHTML = '';
    cluesList.innerHTML = '';
    wordInputElement.disabled = false;
    hintButton.disabled = false;
    deleteButton.disabled = false;
    wordInputElement.focus();
    timerElement.textContent = formatTime(timeLimit);
    wordsFoundElement.textContent = `0/${gameState.placedWords.length}`;
    algorithmStatsElement.textContent = 'Algorithm Stats: Waiting to start...';
    startTimer();
    startGameButton.disabled = true;
    newGameButton.disabled = false;
    selectedCells = [];
    wordInputElement.value = '';
});

hintButton.addEventListener('click', () => {
    provideHint();
});

deleteButton.addEventListener('click', () => {
    wordInputElement.value = '';
    selectedCells.forEach(({ row, col }) => {
        const cell = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
        if (cell) {
            cell.classList.remove('selected');
        }
    });
    selectedCells = [];
});

wordInputElement.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && gameState.isGameStarted) {
        const word = wordInputElement.value.toUpperCase().trim();
        if (!word.match(/^[A-Z]+$/)) {
            alert('Please enter a valid word (letters only)!');
            wordInputElement.value = '';
            selectedCells.forEach(({ row, col }) => {
                const cell = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                if (cell) cell.classList.remove('selected');
            });
            selectedCells = [];
            return;
        }
        if (word && !gameState.foundWords.some(entry => entry.word === word)) {
            if (gameState.englishWords.includes(word)) {
                const result = findWord(gameState.board, word);
                if (result.found) {
                    await markWordAsFound(word, result.path);
                } else {
                    alert('Word not found in the grid!');
                }
            } else {
                alert('Not a valid English word!');
            }
        } else {
            alert('Word already found or invalid!');
        }
        wordInputElement.value = '';
        selectedCells.forEach(({ row, col }) => {
            const cell = boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            if (cell) cell.classList.remove('selected');
        });
        selectedCells = [];
    }
});