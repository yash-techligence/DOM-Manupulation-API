// GitHub Tracker Pro App

const API_BASE = 'https://api.github.com';

// DOM Elements
const usernameSearchInput = document.getElementById('username-search');
const fetchUserBtn = document.getElementById('fetch-user-btn');
const repoSearchInput = document.getElementById('repo-search');
const repoListDropdown = document.getElementById('repo-list');
const repoDropdownContainer = document.getElementById('repo-dropdown-container');
const issueSearchInput = document.getElementById('issue-search');
const loadMoreBtn = document.getElementById('load-more-btn');
const toastContainer = document.getElementById('toast-container');

// Kanban Columns
const kanbanColumns = {
    open: document.getElementById('zone-open'),
    review: document.getElementById('zone-review'),
    closed: document.getElementById('zone-closed')
};

const kanbanCounts = {
    open: document.getElementById('count-open'),
    review: document.getElementById('count-review'),
    closed: document.getElementById('count-closed')
};

// Modal Elements
const modal = document.getElementById('issue-modal');
const closeModalBtn = document.getElementById('close-modal-btn');

// State
let state = {
    username: '',
    repositories: [],
    selectedRepo: null,
    allIssues: [], // original fetched dataset
    openIssues: [],
    inReviewIssues: [],
    closedIssues: [],
    page: 1,
    perPage: 10,
    hasMore: true,
    isLoading: false,
    draggedIssue: null,
    issueStatusMap: {} // Map issue ID to status (open, review, closed) to persist moves during session
};

// Initialization
function init() {
    setupEventListeners();
}

// Utilities
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ri-information-line';
    if (type === 'error') icon = 'ri-error-warning-line';
    if (type === 'success') icon = 'ri-checkbox-circle-line';
    
    toast.innerHTML = `<i class="${icon}"></i> <span>${message}</span>`;
    
    toastContainer.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showErrorMessage(message) {
    showToast(message, 'error');
}

// API Calls
async function apiCall(endpoint) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`);
        
        if (!response.ok) {
            if (response.status === 403) {
                throw new Error('GitHub API rate limit exceeded.');
            } else if (response.status === 404) {
                throw new Error('Resource not found.');
            } else {
                throw new Error(`API Error: ${response.status}`);
            }
        }
        
        return await response.json();
    } catch (error) {
        throw error; // Let the caller handle the UI part
    }
}

async function fetchRepositories(username) {
    if (!username) return;
    
    state.username = username;
    repoSearchInput.value = '';
    repoSearchInput.disabled = true;
    repoListDropdown.innerHTML = '<li class="dropdown-item" style="color: var(--text-muted); text-align: center;">Loading...</li>';
    repoListDropdown.classList.remove('hidden');
    
    try {
        const repos = await apiCall(`/users/${username}/repos?sort=updated&per_page=100`);
        state.repositories = repos;
        
        repoSearchInput.disabled = false;
        renderRepositoryList(repos);
        showToast(`Loaded repositories for ${username}`, 'success');
        
        // Reset issue state
        state.selectedRepo = null;
        state.allIssues = [];
        categorizeIssues();
        clearKanbanBoards();
        
    } catch (error) {
        console.error("Failed to fetch repositories", error);
        repoListDropdown.innerHTML = '<li class="dropdown-item" style="color: var(--danger); text-align: center;">Failed to load repositories. Invalid user?</li>';
        state.repositories = [];
        showErrorMessage(error.message);
        
        setTimeout(() => {
            repoListDropdown.classList.add('hidden');
        }, 2000);
    }
}

async function fetchIssues(repoName, page = 1) {
    if (state.isLoading || !state.username) return;
    
    state.isLoading = true;
    showLoadingSkeletons(page === 1);
    
    if (page === 1) {
        state.allIssues = [];
        state.page = 1;
        state.hasMore = true;
        clearKanbanBoards();
    }

    try {
        // Fetch both open and closed issues
        const issues = await apiCall(`/repos/${state.username}/${repoName}/issues?state=all&page=${page}&per_page=${state.perPage}&sort=updated`);
        
        if (issues.length < state.perPage) {
            state.hasMore = false;
        }
        
        // Filter out pull requests
        const actualIssues = issues.filter(issue => !issue.pull_request);
        
        state.allIssues = [...state.allIssues, ...actualIssues];
        
        // Update local status map for new issues based on Github state
        actualIssues.forEach(issue => {
            if (!state.issueStatusMap[issue.id]) {
                state.issueStatusMap[issue.id] = issue.state === 'open' ? 'open' : 'closed';
            }
        });
        
        categorizeIssues();
        
        const currentQuery = issueSearchInput.value;
        renderAllColumns(currentQuery);
        
        updateLoadMoreButton();
        
    } catch (error) {
        console.error("Failed to fetch issues", error);
        showErrorMessage(error.message);
    } finally {
        state.isLoading = false;
        removeLoadingSkeletons();
    }
}

// Data Processing
function categorizeIssues() {
    state.openIssues = [];
    state.inReviewIssues = [];
    state.closedIssues = [];
    
    state.allIssues.forEach(issue => {
        const status = state.issueStatusMap[issue.id];
        if (status === 'open') {
            state.openIssues.push(issue);
        } else if (status === 'review') {
            state.inReviewIssues.push(issue);
        } else if (status === 'closed') {
            state.closedIssues.push(issue);
        }
    });
}

function filterIssuesArray(issuesArr, query) {
    if (!query) return issuesArr;
    
    query = query.toLowerCase();
    return issuesArr.filter(issue => {
        const matchesTitle = issue.title.toLowerCase().includes(query);
        const matchesBody = issue.body && issue.body.toLowerCase().includes(query);
        const matchesLabel = issue.labels.some(l => l.name.toLowerCase().includes(query));
        const matchesAssignee = issue.assignee && issue.assignee.login.toLowerCase().includes(query);
        const matchesNumber = issue.number.toString().includes(query);
        
        return matchesTitle || matchesBody || matchesLabel || matchesAssignee || matchesNumber;
    });
}

// Rendering
function renderRepositoryList(repos) {
    repoListDropdown.innerHTML = '';
    
    if (repos.length === 0) {
        repoListDropdown.innerHTML = '<li class="dropdown-item" style="color: var(--text-muted); text-align: center;">No repositories found</li>';
        return;
    }

    repos.forEach(repo => {
        const li = document.createElement('li');
        li.className = 'dropdown-item';
        li.dataset.name = repo.name;
        
        li.innerHTML = `
            <div class="repo-name">
                <span>${repo.name}</span>
                ${repo.stargazers_count > 0 ? `<span style="color: var(--warning);"><i class="ri-star-fill"></i> ${repo.stargazers_count}</span>` : ''}
            </div>
            <div class="repo-stats">
                <span><i class="ri-record-circle-line"></i> ${repo.open_issues_count} open issues</span>
                <span><i class="ri-git-branch-line"></i> ${repo.forks_count} forks</span>
            </div>
        `;
        
        repoListDropdown.appendChild(li);
    });
}

function clearKanbanBoards() {
    Object.values(kanbanColumns).forEach(col => {
        col.innerHTML = '';
    });
    updateColumnCounts();
}

function showLoadingSkeletons(clearFirst = true) {
    if (clearFirst) clearKanbanBoards();
    
    const template = document.getElementById('skeleton-template');
    
    ['open', 'review', 'closed'].forEach(status => {
        const col = kanbanColumns[status];
        if (col.children.length === 0 || (col.children.length === 1 && col.children[0].classList.contains('empty-state'))) {
            col.innerHTML = '';
            for (let i = 0; i < 3; i++) {
                col.appendChild(template.content.cloneNode(true));
            }
        }
    });
}

function removeLoadingSkeletons() {
    document.querySelectorAll('.skeleton').forEach(el => el.remove());
}

function renderAllColumns(query = '') {
    renderOpenIssues(query);
    renderInReviewIssues(query);
    renderClosedIssues(query);
    updateColumnCounts();
}

function renderOpenIssues(query) {
    const filtered = filterIssuesArray(state.openIssues, query);
    kanbanColumns.open.innerHTML = '';
    
    if (filtered.length === 0) {
        let text = (state.openIssues.length > 0 && query) ? 'No matching issues found' : 'No open issues';
        kanbanColumns.open.innerHTML = `<div class="empty-state">${text}</div>`;
        return;
    }
    
    filtered.forEach(issue => {
        kanbanColumns.open.appendChild(createIssueCard(issue));
    });
}

function renderInReviewIssues(query) {
    const filtered = filterIssuesArray(state.inReviewIssues, query);
    kanbanColumns.review.innerHTML = '';
    
    if (filtered.length === 0) {
        let text = (state.inReviewIssues.length > 0 && query) ? 'No matching issues found' : 'No issues in review';
        kanbanColumns.review.innerHTML = `<div class="empty-state">${text}</div>`;
        return;
    }
    
    filtered.forEach(issue => {
        kanbanColumns.review.appendChild(createIssueCard(issue));
    });
}

function renderClosedIssues(query) {
    const filtered = filterIssuesArray(state.closedIssues, query);
    kanbanColumns.closed.innerHTML = '';
    
    if (filtered.length === 0) {
        let text = (state.closedIssues.length > 0 && query) ? 'No matching issues found' : 'No closed issues';
        kanbanColumns.closed.innerHTML = `<div class="empty-state">${text}</div>`;
        return;
    }
    
    filtered.forEach(issue => {
        kanbanColumns.closed.appendChild(createIssueCard(issue));
    });
}

function getContrastYIQ(hexcolor){
    if(hexcolor.length === 6) {
        const r = parseInt(hexcolor.substr(0,2),16);
        const g = parseInt(hexcolor.substr(2,2),16);
        const b = parseInt(hexcolor.substr(4,2),16);
        const yiq = ((r*299)+(g*587)+(b*114))/1000;
        return (yiq >= 128) ? 'black' : 'white';
    }
    return 'white';
}

function createIssueCard(issue) {
    const card = document.createElement('div');
    card.className = 'issue-card';
    card.draggable = true;
    card.dataset.id = issue.id;
    card.dataset.issueObj = JSON.stringify(issue);
    
    const labelsHtml = issue.labels.map(label => {
        const textColor = getContrastYIQ(label.color);
        return `<span class="label" style="background-color: #${label.color}; color: ${textColor}; border-color: rgba(0,0,0,0.1)">${label.name}</span>`;
    }).join('');
    
    const assigneeHtml = issue.assignee 
        ? `<div class="assignee"><img src="${issue.assignee.avatar_url}" alt="${issue.assignee.login}"> ${issue.assignee.login}</div>` 
        : `<div class="assignee"><i class="ri-user-unfollow-line"></i> Unassigned</div>`;
        
    card.innerHTML = `
        <div class="issue-card-header">
            <h3 class="issue-title">${issue.title}</h3>
            <span class="issue-number">#${issue.number}</span>
        </div>
        <div class="issue-labels">
            ${labelsHtml}
        </div>
        <div class="issue-footer">
            ${assigneeHtml}
            <div class="issue-meta">
                <span class="meta-icon" title="Comments"><i class="ri-chat-1-line"></i> ${issue.comments}</span>
                <span class="meta-icon" title="Created: ${new Date(issue.created_at).toLocaleDateString()}"><i class="ri-calendar-line"></i></span>
            </div>
        </div>
    `;
    
    return card;
}

function updateColumnCounts() {
    Object.keys(kanbanColumns).forEach(key => {
        const count = kanbanColumns[key].querySelectorAll('.issue-card:not(.skeleton)').length;
        kanbanCounts[key].textContent = count;
    });
}

function updateLoadMoreButton() {
    if (state.hasMore && state.selectedRepo) {
        loadMoreBtn.classList.remove('hidden');
    } else {
        loadMoreBtn.classList.add('hidden');
    }
}

// Event Listeners
function setupEventListeners() {
    // User search
    fetchUserBtn.addEventListener('click', () => {
        const user = usernameSearchInput.value.trim();
        if (user) {
            fetchRepositories(user);
        }
    });

    usernameSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const user = e.target.value.trim();
            if (user) {
                fetchRepositories(user);
            }
        }
    });

    // Dropdown toggle
    repoSearchInput.addEventListener('focus', () => {
        if (!repoSearchInput.disabled && state.repositories.length > 0) {
            repoListDropdown.classList.remove('hidden');
        }
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!repoDropdownContainer.contains(e.target)) {
            repoListDropdown.classList.add('hidden');
        }
    });

    // Search repositories
    repoSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filteredRepos = state.repositories.filter(repo => repo.name.toLowerCase().includes(query));
        renderRepositoryList(filteredRepos);
        repoListDropdown.classList.remove('hidden');
    });

    // Select repository
    repoListDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item) {
            const repoName = item.dataset.name;
            state.selectedRepo = repoName;
            repoSearchInput.value = repoName;
            repoListDropdown.classList.add('hidden');
            
            // Highlight selected
            document.querySelectorAll('.dropdown-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            
            fetchIssues(repoName, 1);
        }
    });

    // Filter Issues
    issueSearchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        renderAllColumns(query);
    });

    // Load More
    loadMoreBtn.addEventListener('click', () => {
        if (state.selectedRepo && !state.isLoading) {
            state.page += 1;
            fetchIssues(state.selectedRepo, state.page);
        }
    });

    // Kanban Drag and Drop (Event Delegation on columns)
    const board = document.querySelector('.kanban-board');
    
    board.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.issue-card');
        if (card) {
            state.draggedIssue = card;
            setTimeout(() => card.classList.add('dragging'), 0);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', card.dataset.id);
        }
    });

    board.addEventListener('dragend', (e) => {
        const card = e.target.closest('.issue-card');
        if (card) {
            card.classList.remove('dragging');
            state.draggedIssue = null;
            
            document.querySelectorAll('.kanban-column .column-body').forEach(col => {
                col.classList.remove('drag-over');
            });
        }
    });

    board.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        const dropzone = e.target.closest('.column-body');
        if (dropzone) {
            dropzone.classList.add('drag-over');
            e.dataTransfer.dropEffect = 'move';
        }
    });

    board.addEventListener('dragleave', (e) => {
        const dropzone = e.target.closest('.column-body');
        if (dropzone && !dropzone.contains(e.relatedTarget)) {
            dropzone.classList.remove('drag-over');
        }
    });

    board.addEventListener('drop', (e) => {
        e.preventDefault();
        const dropzone = e.target.closest('.column-body');
        
        if (dropzone && state.draggedIssue) {
            dropzone.classList.remove('drag-over');
            
            const status = dropzone.parentElement.dataset.status;
            const issueId = parseInt(state.draggedIssue.dataset.id);
            
            // Update the state map
            state.issueStatusMap[issueId] = status;
            
            // Recategorize issues into open/closed/review arrays
            categorizeIssues();
            
            // Rerender all columns dynamically to maintain structure and filters
            const currentQuery = issueSearchInput.value;
            renderAllColumns(currentQuery);
            
            showToast(`Issue moved to ${status}`, 'success');
        }
    });

    // Open Modal
    board.addEventListener('click', (e) => {
        const card = e.target.closest('.issue-card');
        if (card) {
            const issue = JSON.parse(card.dataset.issueObj);
            openModal(issue);
        }
    });

    // Close Modal
    closeModalBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

// Modal Functions
function openModal(issue) {
    document.getElementById('modal-issue-number').textContent = `#${issue.number}`;
    document.getElementById('modal-issue-title').textContent = issue.title;
    
    const statusEl = document.getElementById('modal-issue-status');
    const localStatus = state.issueStatusMap[issue.id];
    
    let statusText = localStatus === 'review' ? 'In Review' : (localStatus.charAt(0).toUpperCase() + localStatus.slice(1));
    
    statusEl.className = `status-badge ${issue.state === 'closed' || localStatus === 'closed' ? 'closed' : 'open'}`;
    statusEl.innerHTML = statusText;
    
    document.getElementById('modal-issue-author').innerHTML = `<i class="ri-user-line"></i> ${issue.user.login}`;
    document.getElementById('modal-issue-date').innerHTML = `<i class="ri-calendar-line"></i> ${new Date(issue.created_at).toLocaleDateString()}`;
    document.getElementById('modal-issue-comments').innerHTML = `<i class="ri-chat-1-line"></i> ${issue.comments} comments`;
    
    // Labels
    const labelsContainer = document.getElementById('modal-issue-labels');
    labelsContainer.innerHTML = issue.labels.map(label => {
        const textColor = getContrastYIQ(label.color);
        return `<span class="label" style="background-color: #${label.color}; color: ${textColor}; font-size: 0.8rem; padding: 0.25rem 0.75rem;">${label.name}</span>`;
    }).join('');
    
    // Body text
    const bodyContainer = document.getElementById('modal-issue-body');
    if (issue.body) {
        let formattedBody = issue.body
            .replace(/</g, '&lt;').replace(/>/g, '&gt;') // escape html
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>') // code blocks
            .replace(/`([^`]+)`/g, '<code>$1</code>') // inline code
            .replace(/\n/g, '<br>'); // new lines
            
        bodyContainer.innerHTML = formattedBody;
    } else {
        bodyContainer.innerHTML = '<em>No description provided.</em>';
    }
    
    document.getElementById('modal-issue-link').href = issue.html_url;
    
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; 
}

function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// Start application
init();
