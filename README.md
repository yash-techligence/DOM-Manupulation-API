# GitHub Issue Tracker

A responsive single-page web application that allows users to search public GitHub repositories and manage their open issues in a dynamic Kanban-style board. Built entirely from scratch using only HTML, CSS, and Vanilla JavaScript.

## Features I Have Built

1. **Dual Search Modes**:
   - **Repository Search**: Enter `owner/repo` (e.g., `yash-techligence/Advanced-CSS-JS`) to instantly load repository statistics and its issues.
   - **User Search**: Enter a GitHub username (e.g., `yash-techligence`) to fetch and display a list of all public repositories belonging to that user. Clicking on any repository card automatically loads its issues.

2. **Real-Time Repository Syncing**:
   - **Auto-Polling**: When viewing a user's repository list, the app silently checks GitHub every 60 seconds in the background. Newly created or deleted repositories automatically reflect on the page without manual reloads.
   - **Manual Refresh**: A dedicated refresh button is provided to instantly pull the latest repositories, complete with a loading animation.

3. **Interactive Kanban Board**:
   - Displays fetched issues in three columns: **Open**, **In Review**, and **Closed**.
   - **HTML5 Drag-and-Drop**: Users can move issue cards between columns seamlessly. Implemented using native browser APIs (`dragstart`, `dragover`, `drop`, `dragend`) without any external drag-drop libraries.
   - Uses event delegation efficiently (one listener per column) for optimal performance.

4. **Dynamic Data Fetching & Processing**:
   - Uses `async/await`, `fetch()`, and `Promise.all()` to pull repository details and issues concurrently for faster load times.
   - **Pagination**: Initially loads 10 issues, with a "Load More" button to append subsequent pages dynamically.
   - **Skeleton Loaders**: Custom CSS animations display skeleton cards while API data is loading, enhancing perceived performance and user experience.

5. **Advanced Filtering**:
   - A real-time filter bar allows users to instantly search visible issue cards by keyword, title, description, label, or assignee.

6. **Detailed Issue Modal**:
   - Clicking an issue card opens an inline modal containing the full issue body, labels, comment count, and a direct link to the issue on GitHub. 

7. **Robust Error Handling**:
   - Gracefully manages edge cases like repository/user not found (404), API rate limits exceeded (403), and general network failures using `try/catch`.
   - Displays user-friendly error banners directly in the UI.

8. **Modern UI/UX Design**:
   - Fully responsive design using CSS Flexbox and Grid.
   - Premium dark-mode aesthetics, custom scrollbars, hover micro-animations, and dynamic label coloring based on hex contrast.

## Technologies Used
- HTML5
- CSS3 (Custom Properties, Flexbox, Grid, Animations)
- Vanilla JavaScript (ES6+, DOM Manipulation, Fetch API)

## How to Run the Project

Since this project requires no build tools or dependencies, setup is instantaneous:

1. **Clone or Download** the project to your local machine.
2. **Open the App**:
   - Simply double-click the `index.html` file to open it in your web browser.
   - *Alternative*: Use a local server like the "Live Server" extension in VS Code for an optimal development experience.
3. Start searching! Try searching for `yash-techligence` to see the live repository fetching in action.
