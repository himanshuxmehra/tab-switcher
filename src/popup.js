const searchInput = document.getElementById('searchInput');
const resultsContainer = document.getElementById('results');
const suggestionsContainer = document.getElementById('suggestions');
const filterButtons = document.querySelectorAll('.filter-btn');
let selectedIndex = -1;
let currentFilter = 'all';

// Search operators configuration
const searchOperators = {
  site: 'site:',
  title: 'title:',
  url: 'url:'
};

// Keyboard shortcuts configuration
const keyboardShortcuts = {
  nextItem: 'ArrowDown',
  previousItem: 'ArrowUp',
  selectItem: 'Enter',
  closePopup: 'Escape',
  newTab: 'Ctrl+Enter',
  newWindow: 'Ctrl+Shift+Enter'
};

// Initialize search filters
filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    filterButtons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    currentFilter = button.dataset.filter;
    updateResults();
  });
});

searchInput.focus();

searchInput.addEventListener('input', (e) => {
  showSuggestions(e.target.value);
  updateResults();
});

function parseSearchQuery(query) {
  const operators = {};
  let remainingQuery = query;

  // Extract operators
  Object.entries(searchOperators).forEach(([operator, prefix]) => {
    const regex = new RegExp(`${prefix}([^\\s]+)`, 'i');
    const match = remainingQuery.match(regex);
    if (match) {
      operators[operator] = match[1];
      remainingQuery = remainingQuery.replace(regex, '').trim();
    }
  });

  return {
    operators,
    remainingQuery: remainingQuery.toLowerCase()
  };
}

function fuzzyMatch(query, text) {
  if (!query) return true;
  query = query.toLowerCase();
  text = text.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === query[queryIndex]) {
      queryIndex++;
      if (queryIndex === query.length) return true;
    }
  }
  return false;
}

function matchesOperators(item, operators) {
  if (Object.keys(operators).length === 0) return true;

  return Object.entries(operators).every(([operator, value]) => {
    switch (operator) {
      case 'site':
        return item.url && new URL(item.url).hostname.includes(value);
      case 'title':
        return item.title && item.title.toLowerCase().includes(value.toLowerCase());
      case 'url':
        return item.url && item.url.toLowerCase().includes(value.toLowerCase());
      default:
        return true;
    }
  });
}

async function updateResults() {
  const query = searchInput.value;
  const { operators, remainingQuery } = parseSearchQuery(query);
  
  resultsContainer.innerHTML = '';
  selectedIndex = 0;

  if (currentFilter === 'all' || currentFilter === 'tabs') {
    const tabs = await chrome.tabs.query({});
    const filteredTabs = tabs.filter(tab => 
      matchesOperators(tab, operators) &&
      (fuzzyMatch(remainingQuery, tab.title) || 
       fuzzyMatch(remainingQuery, tab.url) ||
       fuzzyMatch(remainingQuery, new URL(tab.url).hostname))
    );
    if (filteredTabs.length > 0) {
      renderResults(filteredTabs, 'tab');
    }
  }

  if ((currentFilter === 'all' || currentFilter === 'history') && remainingQuery) {
    const historyItems = await searchHistory(remainingQuery, operators);
    if (historyItems.length > 0) {
      renderResults(historyItems, 'history');
    }
  }

  if ((currentFilter === 'all' || currentFilter === 'bookmarks') && remainingQuery) {
    const bookmarkItems = await searchBookmarks(remainingQuery, operators);
    if (bookmarkItems.length > 0) {
      renderResults(bookmarkItems, 'bookmark');
    }
  }

  if (isValidUrl(remainingQuery)) {
    addNewUrlItem(remainingQuery);
  }

  updateSelection();
}

function renderResults(items, type) {
  items.forEach((item, index) => {
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    resultItem.setAttribute('data-index', index);
    resultItem.setAttribute('data-url', item.url);

    const favicon = document.createElement('img');
    favicon.className = 'favicon';
    favicon.src = item.favIconUrl || 'icon.svg';
    favicon.onerror = () => { favicon.src = 'icon.svg'; };

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = item.title;

    const resultType = document.createElement('span');
    resultType.className = 'result-type';
    resultType.textContent = type;

    resultItem.appendChild(favicon);
    resultItem.appendChild(title);
    resultItem.appendChild(resultType);

    if (type === 'tab') {
      resultItem.addEventListener('click', () => switchToTab(item.id));
    } else {
      resultItem.addEventListener('click', () => goToUrl(item.url));
    }

    resultsContainer.appendChild(resultItem);
  });
}

async function searchHistory(query, operators) {
  return new Promise((resolve) => {
    chrome.history.search({ 
      text: query, 
      maxResults: 10,
      startTime: Date.now() - (30 * 24 * 60 * 60 * 1000) // Last 30 days
    }, (results) => {
      const uniqueResults = results.reduce((acc, item) => {
        if (!acc.some(existing => existing.url === item.url) && matchesOperators(item, operators)) {
          acc.push(item);
        }
        return acc;
      }, []);

      uniqueResults.sort((a, b) => {
        if (a.visitCount !== b.visitCount) {
          return b.visitCount - a.visitCount;
        }
        return b.lastVisitTime - a.lastVisitTime;
      });

      resolve(uniqueResults.slice(0, 5));
    });
  });
}

async function searchBookmarks(query, operators) {
  return new Promise((resolve) => {
    chrome.bookmarks.search(query, (results) => {
      const filteredResults = results
        .filter(item => item.url && matchesOperators(item, operators))
        .slice(0, 5);
      resolve(filteredResults);
    });
  });
}

function addNewUrlItem(query) {
  const newUrlItem = document.createElement('div');
  newUrlItem.className = 'result-item';
  newUrlItem.setAttribute('data-index', resultsContainer.children.length);

  const favicon = document.createElement('img');
  favicon.className = 'favicon';
  favicon.src = 'icon.svg';

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = `Go to: ${query}`;

  newUrlItem.appendChild(favicon);
  newUrlItem.appendChild(title);
  newUrlItem.addEventListener('click', () => goToUrl(query));
  resultsContainer.appendChild(newUrlItem);
}

function switchToTab(tabId) {
  chrome.tabs.update(tabId, { active: true });
  window.close();
}

function goToUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  chrome.tabs.create({ url: url });
  window.close();
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return /^[\w-]+(\.[a-z]{2,})+$/.test(string);
  }
}

function updateSelection() {
  const items = resultsContainer.querySelectorAll('.result-item');
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

function selectNextItem() {
  const items = resultsContainer.querySelectorAll('.result-item');
  if (items.length > 0) {
    selectedIndex = (selectedIndex + 1) % items.length;
    updateSelection();
  }
}

function selectPreviousItem() {
  const items = resultsContainer.querySelectorAll('.result-item');
  if (items.length > 0) {
    selectedIndex = (selectedIndex - 1 + items.length) % items.length;
    updateSelection();
  }
}

function handleSelectedItem() {
  const selectedItem = resultsContainer.querySelector('.result-item.selected');
  if (selectedItem) {
    selectedItem.click();
  } else if (isValidUrl(searchInput.value)) {
    goToUrl(searchInput.value);
  }
}

function handleKeyboardShortcut(e) {
  const key = e.key;
  const isCtrl = e.ctrlKey;
  const isShift = e.shiftKey;
  
  // Prevent default behavior for our shortcuts
  if (key === keyboardShortcuts.nextItem || 
      key === keyboardShortcuts.previousItem || 
      key === keyboardShortcuts.selectItem) {
    e.preventDefault();
  }

  switch (key) {
    case keyboardShortcuts.nextItem:
      selectNextItem();
      break;
    case keyboardShortcuts.previousItem:
      selectPreviousItem();
      break;
    case keyboardShortcuts.selectItem:
      if (isCtrl && isShift) {
        // Open in new window
        const selectedItem = resultsContainer.querySelector('.result-item.selected');
        if (selectedItem) {
          const url = selectedItem.getAttribute('data-url');
          if (url) {
            chrome.windows.create({ url: url });
            window.close();
          }
        }
      } else if (isCtrl) {
        // Open in new tab
        const selectedItem = resultsContainer.querySelector('.result-item.selected');
        if (selectedItem) {
          const url = selectedItem.getAttribute('data-url');
          if (url) {
            chrome.tabs.create({ url: url });
            window.close();
          }
        }
      } else {
        handleSelectedItem();
      }
      break;
    case keyboardShortcuts.closePopup:
      if (selectedIndex !== -1) {
        selectedIndex = -1;
        updateSelection();
        searchInput.focus();
      } else {
        window.close();
      }
      break;
  }
}

// Replace the existing keydown event listener
searchInput.removeEventListener('keydown', (e) => {});
searchInput.addEventListener('keydown', handleKeyboardShortcut);

resultsContainer.addEventListener('mousemove', (e) => {
  const item = e.target.closest('.result-item');
  if (item) {
    selectedIndex = parseInt(item.getAttribute('data-index'));
    updateSelection();
  }
});

function showSuggestions(query) {
  if (!query) {
    suggestionsContainer.style.display = 'none';
    return;
  }

  const suggestions = [];
  
  // Add operator suggestions
  Object.entries(searchOperators).forEach(([operator, prefix]) => {
    if (query.toLowerCase().startsWith(operator)) {
      suggestions.push({
        text: `${prefix}example.com`,
        description: `Search by ${operator}`
      });
    }
  });

  // Add common domain suggestions
  if (query.length > 2) {
    const commonDomains = ['github.com', 'youtube.com', 'google.com', 'twitter.com'];
    commonDomains.forEach(domain => {
      if (domain.includes(query.toLowerCase())) {
        suggestions.push({
          text: domain,
          description: 'Common domain'
        });
      }
    });
  }

  if (suggestions.length > 0) {
    suggestionsContainer.innerHTML = '';
    suggestions.forEach(suggestion => {
      const suggestionItem = document.createElement('div');
      suggestionItem.className = 'suggestion-item';
      
      const text = document.createElement('span');
      text.textContent = suggestion.text;
      
      const description = document.createElement('span');
      description.textContent = ` - ${suggestion.description}`;
      description.style.color = '#888';
      description.style.fontSize = '12px';
      
      suggestionItem.appendChild(text);
      suggestionItem.appendChild(description);
      
      suggestionItem.addEventListener('click', () => {
        searchInput.value = suggestion.text;
        suggestionsContainer.style.display = 'none';
        updateResults();
      });
      
      suggestionsContainer.appendChild(suggestionItem);
    });
    
    suggestionsContainer.style.display = 'block';
  } else {
    suggestionsContainer.style.display = 'none';
  }
}

// Add styles for suggestions
const style = document.createElement('style');
style.textContent = `
  .suggestions {
    max-height: 100px;
    overflow-y: auto;
    background-color: #14213d;
    border-bottom: 1px solid #333;
  }
  
  .suggestion-item {
    padding: 5px 10px;
    cursor: pointer;
    color: #f0f0f0;
  }
  
  .suggestion-item:hover {
    background-color: #000;
  }
`;
document.head.appendChild(style);

// Initial population of results
updateResults();
