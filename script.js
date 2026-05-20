// Global state
const state = {
    repo: null,
    issues: [],
    page: 1,
    perPage: 10,
    isLoading: false,
    currentQuery: '',
    draggedIssueId: null,
    repoPollInterval: null
};

// DOM Elements
const elements = {
    repoInput: document.getElementById('repo-input'),
    searchBtn: document.getElementById('search-btn'),
    errorMessage: document.getElementById('error-message'),
    repoDetails: document.getElementById('repo-details'),
    repoListContainer: document.getElementById('repo-list-container'),
    repoListHeaderBtn: document.getElementById('refresh-repos-btn'),
    repoList: document.getElementById('repo-list'),
    userNameDisplay: document.getElementById('user-name-display'),
    repoName: document.getElementById('repo-name'),
    repoStars: document.getElementById('repo-stars'),
    repoForks: document.getElementById('repo-forks'),
    repoOpenIssues: document.getElementById('repo-open-issues'),
    boardControls: document.getElementById('board-controls'),
    filterInput: document.getElementById('filter-input'),
    kanbanBoard: document.querySelector('.kanban-board'),
    loadMoreContainer: document.querySelector('.load-more-container'),
    loadMoreBtn: document.getElementById('load-more-btn'),
    modal: document.getElementById('issue-modal'),
    closeBtn: document.querySelector('.close-btn'),
    skeletonTemplate: document.getElementById('skeleton-template')
};

// Columns
const columns = {
    open: document.getElementById('col-open'),
    'in-review': document.getElementById('col-in-review'),
    closed: document.getElementById('col-closed')
};

// Column counts
const columnCounts = {
    open: document.querySelector('[data-status="open"] .issue-count'),
    'in-review': document.querySelector('[data-status="in-review"] .issue-count'),
    closed: document.querySelector('[data-status="closed"] .issue-count')
};

// Event Listeners
elements.searchBtn.addEventListener('click', handleSearch);
elements.repoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSearch();
});
elements.loadMoreBtn.addEventListener('click', loadMoreIssues);
elements.filterInput.addEventListener('input', handleFilter);
elements.closeBtn.addEventListener('click', closeModal);
elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) closeModal();
});
elements.repoListHeaderBtn.addEventListener('click', () => {
    if (state.currentQuery && !state.currentQuery.includes('/')) {
        fetchUserRepos(state.currentQuery, true);
    }
});

// Setup Drag and Drop on Columns
Object.values(columns).forEach(column => {
    column.addEventListener('dragover', handleDragOver);
    column.addEventListener('dragleave', handleDragLeave);
    column.addEventListener('drop', handleDrop);
});

// Event Delegation for Kanban Board
elements.kanbanBoard.addEventListener('dragstart', handleDragStart);
elements.kanbanBoard.addEventListener('dragend', handleDragEnd);
elements.kanbanBoard.addEventListener('click', handleCardClick);

// Functions
async function handleSearch() {
    const query = elements.repoInput.value.trim();
    if (!query) return;
    
    // Clear UI
    hideError();
    clearColumns();
    elements.repoListContainer.classList.add('hidden');
    elements.repoDetails.classList.add('hidden');
    elements.boardControls.classList.add('hidden');
    elements.kanbanBoard.classList.add('hidden');
    elements.loadMoreContainer.classList.add('hidden');

    if (query.includes('/')) {
        // Direct repository search
        stopRepoPolling();
        state.currentQuery = query;
        state.page = 1;
        state.issues = [];
        updateCounts();
        await fetchRepoAndIssues();
    } else {
        // User search
        state.currentQuery = query;
        await fetchUserRepos(query);
    }
}

async function fetchUserRepos(username, isSilent = false) {
    if (state.isLoading && !isSilent) return;
    
    if (!isSilent) setLoading(true);
    if (isSilent) elements.repoListHeaderBtn.classList.add('rotating');

    try {
        const url = `https://api.github.com/users/${username}/repos?sort=updated&per_page=100`;
        const res = await fetch(url);

        if (res.status === 404) throw new Error('User not found.');
        if (res.status === 403) throw new Error('API rate limit exceeded.');
        if (!res.ok) throw new Error(`Error: ${res.status} ${res.statusText}`);

        const repos = await res.json();
        
        if (repos.length === 0) {
            elements.repoList.innerHTML = '<p style="padding:1rem;color:var(--text-secondary);">This user has no public repositories.</p>';
            elements.repoListContainer.classList.remove('hidden');
        } else {
            renderRepoList(username, repos);
        }

        startRepoPolling(username);

    } catch (error) {
        if (!isSilent) showError(error.message);
    } finally {
        if (!isSilent) setLoading(false);
        if (isSilent) elements.repoListHeaderBtn.classList.remove('rotating');
    }
}

function startRepoPolling(username) {
    stopRepoPolling();
    state.repoPollInterval = setInterval(() => {
        if (!elements.repoListContainer.classList.contains('hidden')) {
            fetchUserRepos(username, true);
        } else {
            stopRepoPolling();
        }
    }, 60000); // Check every 60 seconds
}

function stopRepoPolling() {
    if (state.repoPollInterval) {
        clearInterval(state.repoPollInterval);
        state.repoPollInterval = null;
    }
}

function renderRepoList(username, repos) {
    elements.userNameDisplay.textContent = username;
    elements.repoList.innerHTML = '';
    
    repos.forEach(repo => {
        const card = document.createElement('div');
        card.className = 'repo-list-card';
        card.innerHTML = `
            <h3>${escapeHTML(repo.name)}</h3>
            <p>${escapeHTML(repo.description || 'No description available.')}</p>
            <div class="repo-list-stats">
                <span>⭐ ${repo.stargazers_count}</span>
                <span>🍴 ${repo.forks_count}</span>
                <span>🔴 ${repo.open_issues_count} issues</span>
            </div>
        `;
        card.addEventListener('click', () => {
            elements.repoInput.value = repo.full_name;
            handleSearch();
        });
        elements.repoList.appendChild(card);
    });

    elements.repoListContainer.classList.remove('hidden');
}

async function fetchRepoAndIssues() {
    if (state.isLoading) return;
    
    setLoading(true);
    showSkeletons();

    try {
        const repoUrl = `https://api.github.com/repos/${state.currentQuery}`;
        const issuesUrl = `https://api.github.com/repos/${state.currentQuery}/issues?state=all&per_page=${state.perPage}&page=${state.page}`;

        // Fetch Repo and initial Issues concurrently
        const [repoRes, issuesRes] = await Promise.all([
            fetch(repoUrl),
            fetch(issuesUrl)
        ]);

        if (repoRes.status === 404) throw new Error('Repository not found. Please check the owner/repository format.');
        if (repoRes.status === 403 || issuesRes.status === 403) throw new Error('API rate limit exceeded. Please try again later.');
        if (!repoRes.ok) throw new Error(`Error: ${repoRes.status} ${repoRes.statusText}`);
        if (!issuesRes.ok) throw new Error(`Error: ${issuesRes.status} ${issuesRes.statusText}`);

        const repoData = await repoRes.json();
        const issuesData = await issuesRes.json();

        // Update Repo Details
        state.repo = repoData;
        displayRepoDetails();

        // Process Issues
        processFetchedIssues(issuesData);

        elements.repoDetails.classList.remove('hidden');
        elements.boardControls.classList.remove('hidden');
        elements.kanbanBoard.classList.remove('hidden');
        
        // Show load more if we got a full page
        if (issuesData.length === state.perPage) {
            elements.loadMoreContainer.classList.remove('hidden');
        } else {
            elements.loadMoreContainer.classList.add('hidden');
        }

    } catch (error) {
        showError(error.message || 'A network error occurred while fetching data.');
        clearColumns();
    } finally {
        setLoading(false);
        removeSkeletons();
        updateCounts();
    }
}

async function loadMoreIssues() {
    if (state.isLoading) return;
    state.page++;
    
    setLoading(true);
    showSkeletons();

    try {
        const issuesUrl = `https://api.github.com/repos/${state.currentQuery}/issues?state=all&per_page=${state.perPage}&page=${state.page}`;
        const issuesRes = await fetch(issuesUrl);

        if (issuesRes.status === 403) throw new Error('API rate limit exceeded.');
        if (!issuesRes.ok) throw new Error(`Error fetching issues: ${issuesRes.status}`);

        const issuesData = await issuesRes.json();
        processFetchedIssues(issuesData);

        if (issuesData.length < state.perPage) {
            elements.loadMoreContainer.classList.add('hidden');
        }

    } catch (error) {
        showError(error.message);
        state.page--; // Revert page increment
    } finally {
        setLoading(false);
        removeSkeletons();
        updateCounts();
    }
}

function processFetchedIssues(issuesData) {
    issuesData.forEach(issue => {
        // Only add if not already in state
        if (!state.issues.find(i => i.id === issue.id)) {
            // Determine initial status based on GH state
            let status = 'open';
            if (issue.state === 'closed') {
                status = 'closed';
            } else if (issue.assignee || issue.pull_request) {
                // Heuristic: if assigned or is PR, maybe in-review
                status = 'in-review';
            }
            
            const issueObj = {
                ...issue,
                kanbanStatus: status
            };
            state.issues.push(issueObj);
            renderIssue(issueObj);
        }
    });
    updateCounts();
    
    // Apply current filter if any
    if (elements.filterInput.value) {
        handleFilter();
    }
}

function renderIssue(issue) {
    const card = document.createElement('div');
    card.className = 'issue-card';
    card.draggable = true;
    card.dataset.id = issue.id;

    // Build labels HTML
    let labelsHtml = '';
    if (issue.labels && issue.labels.length > 0) {
        labelsHtml = `<div class="labels-container">
            ${issue.labels.map(label => {
                const color = label.color;
                // Calculate contrast color for text
                const r = parseInt(color.substr(0, 2), 16);
                const g = parseInt(color.substr(2, 2), 16);
                const b = parseInt(color.substr(4, 2), 16);
                const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
                const textColor = (yiq >= 128) ? '#000' : '#fff';
                return `<span class="label" style="background-color: #${color}; color: ${textColor}">${label.name}</span>`;
            }).join('')}
        </div>`;
    }

    // Assignee HTML
    let assigneeHtml = '';
    if (issue.assignee) {
        assigneeHtml = `
            <div class="assignee">
                <img class="assignee-avatar" src="${issue.assignee.avatar_url}" alt="${issue.assignee.login}">
                <span>${issue.assignee.login}</span>
            </div>
        `;
    }

    const date = new Date(issue.created_at).toLocaleDateString();

    card.innerHTML = `
        <div class="issue-number">#${issue.number}</div>
        <div class="issue-title">${escapeHTML(issue.title)}</div>
        ${labelsHtml}
        <div class="issue-meta">
            <span>${date}</span>
            ${assigneeHtml}
        </div>
    `;

    columns[issue.kanbanStatus].appendChild(card);
}

// Drag and Drop Handlers
function handleDragStart(e) {
    const card = e.target.closest('.issue-card');
    if (!card) return;
    
    card.classList.add('dragging');
    state.draggedIssueId = parseInt(card.dataset.id);
    // Required for Firefox
    e.dataTransfer.setData('text/plain', card.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    const card = e.target.closest('.issue-card');
    if (card) {
        card.classList.remove('dragging');
    }
    state.draggedIssueId = null;
    
    // Remove drag-over classes from all columns
    Object.values(columns).forEach(col => col.classList.remove('drag-over'));
}

function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
    const dropZone = e.currentTarget;
    dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    const dropZone = e.currentTarget;
    dropZone.classList.remove('drag-over');

    const cardId = state.draggedIssueId;
    if (!cardId) return;

    const card = document.querySelector(`.issue-card[data-id="${cardId}"]`);
    if (card) {
        // Move DOM element
        dropZone.appendChild(card);
        
        // Update state
        const targetStatus = dropZone.parentElement.dataset.status;
        const issue = state.issues.find(i => i.id === cardId);
        if (issue) {
            issue.kanbanStatus = targetStatus;
        }
        
        updateCounts();
    }
}

// Filtering
function handleFilter() {
    const term = elements.filterInput.value.toLowerCase();
    const cards = document.querySelectorAll('.issue-card:not(.skeleton-card)');
    
    cards.forEach(card => {
        const id = parseInt(card.dataset.id);
        const issue = state.issues.find(i => i.id === id);
        if (!issue) return;

        const matchTitle = issue.title.toLowerCase().includes(term);
        const matchBody = issue.body ? issue.body.toLowerCase().includes(term) : false;
        const matchLabel = issue.labels.some(l => l.name.toLowerCase().includes(term));
        const matchAssignee = issue.assignee ? issue.assignee.login.toLowerCase().includes(term) : false;

        if (matchTitle || matchBody || matchLabel || matchAssignee) {
            card.classList.remove('hidden');
        } else {
            card.classList.add('hidden');
        }
    });
    
    updateCounts(); // Update empty states after filtering
}

// Modal handling
function handleCardClick(e) {
    const card = e.target.closest('.issue-card');
    if (!card || e.target.closest('.skeleton-card')) return;

    const id = parseInt(card.dataset.id);
    const issue = state.issues.find(i => i.id === id);
    if (issue) {
        openModal(issue);
    }
}

function openModal(issue) {
    document.getElementById('modal-title').textContent = issue.title;
    document.getElementById('modal-number').textContent = `#${issue.number}`;
    
    const stateEl = document.getElementById('modal-state');
    stateEl.textContent = issue.state;
    stateEl.className = `state-badge ${issue.state}`;
    
    document.getElementById('modal-comments').textContent = issue.comments;
    document.getElementById('modal-date').textContent = new Date(issue.created_at).toLocaleDateString();
    
    const assigneeContainer = document.getElementById('modal-assignee');
    if (issue.assignee) {
        assigneeContainer.innerHTML = `
            <img class="assignee-avatar" src="${issue.assignee.avatar_url}" alt="${issue.assignee.login}">
            <span>${issue.assignee.login}</span>
        `;
    } else {
        assigneeContainer.innerHTML = '<span>Unassigned</span>';
    }

    document.getElementById('modal-link').href = issue.html_url;
    
    // Labels
    const labelsContainer = document.getElementById('modal-labels');
    labelsContainer.innerHTML = '';
    if (issue.labels && issue.labels.length > 0) {
        issue.labels.forEach(label => {
            const span = document.createElement('span');
            span.className = 'label';
            const r = parseInt(label.color.substr(0, 2), 16);
            const g = parseInt(label.color.substr(2, 2), 16);
            const b = parseInt(label.color.substr(4, 2), 16);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            const textColor = (yiq >= 128) ? '#000' : '#fff';
            span.style.backgroundColor = `#${label.color}`;
            span.style.color = textColor;
            span.textContent = label.name;
            labelsContainer.appendChild(span);
        });
    }

    document.getElementById('modal-body').textContent = issue.body || 'No description provided.';
    
    elements.modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent scrolling
}

function closeModal() {
    elements.modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// UI Helpers
function displayRepoDetails() {
    if (!state.repo) return;
    elements.repoName.textContent = state.repo.full_name;
    elements.repoStars.textContent = state.repo.stargazers_count.toLocaleString();
    elements.repoForks.textContent = state.repo.forks_count.toLocaleString();
    elements.repoOpenIssues.textContent = state.repo.open_issues_count.toLocaleString();
}

function setLoading(isLoading) {
    state.isLoading = isLoading;
    elements.searchBtn.disabled = isLoading;
    elements.repoInput.disabled = isLoading;
    elements.loadMoreBtn.disabled = isLoading;
    elements.loadMoreBtn.textContent = isLoading ? 'Loading...' : 'Load More Issues';
}

function showSkeletons() {
    for (let i = 0; i < 3; i++) {
        const clone1 = elements.skeletonTemplate.content.cloneNode(true);
        const clone2 = elements.skeletonTemplate.content.cloneNode(true);
        const clone3 = elements.skeletonTemplate.content.cloneNode(true);
        
        columns.open.appendChild(clone1);
        columns['in-review'].appendChild(clone2);
        columns.closed.appendChild(clone3);
    }
}

function removeSkeletons() {
    document.querySelectorAll('.skeleton-card').forEach(el => el.remove());
}

function clearColumns() {
    Object.values(columns).forEach(col => {
        col.innerHTML = '';
    });
}

function updateCounts() {
    Object.keys(columns).forEach(status => {
        const col = columns[status];
        // Count actual issue cards, not skeletons
        const count = col.querySelectorAll('.issue-card:not(.skeleton-card):not(.hidden)').length;
        columnCounts[status].textContent = count;
        
        // Handle empty state
        let emptyState = col.querySelector('.empty-state');
        if (count === 0 && !state.isLoading) {
            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.textContent = 'No issues found';
                col.appendChild(emptyState);
            }
        } else {
            if (emptyState) emptyState.remove();
        }
    });
}

function showError(msg) {
    elements.errorMessage.textContent = msg;
    elements.errorMessage.classList.remove('hidden');
}

function hideError() {
    elements.errorMessage.classList.add('hidden');
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
