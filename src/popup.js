const searchInput = document.getElementById('searchInput');
const resultsContainer = document.getElementById('results');
let selectedIndex = -1;

searchInput.focus();

searchInput.addEventListener('input', updateResults);

async function updateResults() {
  const query = searchInput.value.toLowerCase();
  const tabs = await chrome.tabs.query({});
  const filteredTabs = tabs.filter(tab => tab.title.toLowerCase().includes(query) || tab.url.toLowerCase().includes(query));

  resultsContainer.innerHTML = '';
  selectedIndex = 0;

  if (filteredTabs.length > 0) {
    renderResults(filteredTabs, 'tab');
  } else if (query) {
    const historyItems = await searchHistory(query);
    console.log(query)
    renderResults(historyItems, 'history');
  }

  if (isValidUrl(query)) {
    addNewUrlItem(query);
  }

  updateSelection();
}

function renderResults(items, type) {
  items.forEach((item, index) => {
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    resultItem.setAttribute('data-index', index);

    const favicon = document.createElement('img');
    favicon.className = 'favicon';
    favicon.src = item.favIconUrl || 'default-favicon.png';
    favicon.onerror = () => { favicon.src = 'default-favicon.png'; };

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = item.title;

    resultItem.appendChild(favicon);
    resultItem.appendChild(title);

    if (type === 'tab') {
      resultItem.addEventListener('click', () => switchToTab(item.id));
    } else {
      resultItem.addEventListener('click', () => goToUrl(item.url));
    }

    resultsContainer.appendChild(resultItem);
  });
}

async function searchHistory(query) {
  console.log(query)
  return new Promise((resolve) => {
    chrome.history.search({ text: query, maxResults: 5 }, (results) => {
      resolve(results);
    });
  });
}

function addNewUrlItem(query) {
  const newUrlItem = document.createElement('div');
  newUrlItem.className = 'result-item';
  newUrlItem.setAttribute('data-index', resultsContainer.children.length);

  const favicon = document.createElement('img');
  favicon.className = 'favicon';
  favicon.src = 'default-favicon.png';

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

searchInput.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectNextItem();
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectPreviousItem();
      break;
    case 'Enter':
      e.preventDefault();
      handleSelectedItem();
      break;
    case 'Escape':
      if (selectedIndex !== -1) {
        selectedIndex = -1;
        updateSelection();
        searchInput.focus();
      } else {
        window.close();
      }
      break;
  }
});

resultsContainer.addEventListener('mousemove', (e) => {
  const item = e.target.closest('.result-item');
  if (item) {
    selectedIndex = parseInt(item.getAttribute('data-index'));
    updateSelection();
  }
});

// Initial population of results
updateResults();
