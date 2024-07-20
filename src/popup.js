document.getElementById('search').addEventListener('input', function(event) {
    const query = event.target.value;
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = '';
  
    if (query.startsWith('http') || query.includes('.')) {
      const newUrlItem = document.createElement('li');
      newUrlItem.textContent = `Go to ${query}`;
      newUrlItem.addEventListener('click', () => {
        browser.tabs.create({ url: query });
      });
      resultsContainer.appendChild(newUrlItem);
    } else {
      browser.tabs.query({}).then(tabs => {
        const filteredTabs = tabs.filter(tab => tab.title.toLowerCase().includes(query.toLowerCase()));
        filteredTabs.forEach(tab => {
          const tabItem = document.createElement('li');
          tabItem.textContent = tab.title;
          tabItem.addEventListener('click', () => {
            browser.tabs.update(tab.id, { active: true });
          });
          resultsContainer.appendChild(tabItem);
        });
      });
    }
  });
  