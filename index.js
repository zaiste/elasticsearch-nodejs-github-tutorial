const axios = require('axios');
const elasticsearch = require('elasticsearch');

const client = new elasticsearch.Client({
  host: 'localhost:9200',
  // log: 'trace'
});

const create = async () => {
  await client.indices.create({
    index: 'github',
    body: {
      mappings: {
        trending: {
          properties: {
            name: { type: 'text' },
            url: { type: 'text' },
            description: { type: 'text', analyzer: 'english' },
            readme: { type: 'text', analyzer: 'english' },
          }
        }
      }
    }
  });
};

const index = async ({ name, description, readme }) => {
  await client.index({
    index: 'github',
    type: 'trending',
    body: { name, description, readme }
  })
}

const search = async query => {
  const results = await client.search({
    index: 'github',
    size: 10,
    body: {
      query: {
        multi_match: {
          query,
          type: 'cross_fields',
          fields: ['name', 'description^2', 'readme^3'],
          operator: 'or',
          tie_breaker: 1.0,
          cutoff_frequency: 0.1
        }
      }
    }
  })

  return results.hits.hits.map(({ _source: { name, description, readme } }) => ({
    name, description, readme,
  }))
}

const fetchTrendingRepositories = async () => {
  const { data: { items } } = await axios({
    baseURL: 'https://api.github.com/',
    url: "/search/repositories",
    params: {
      sort: 'stars',
      order: 'desc',
      q: 'language:javascript created:>2018-04-15',
    }
  })

  return items.map(({ id, full_name, html_url, description }) => ({ id, name: full_name, url: html_url, description }));
}

const fetchReadme = async name => {
  const { data: readme }= await axios({
    baseURL: 'https://api.github.com/',
    url: `/repos/${name}/readme`,
    headers: {
      accept: "application/vnd.github.v3.raw"
    }
  })

  return readme;
}


const store = async () => {
  try {
    const repos = await fetchTrendingRepositories();
    for (const repo of repos.slice(0, 2)) {
      const readme = await fetchReadme(repo.name);
      await index({ ...repo, readme })
    }
  } catch (error) {
    console.log(error.message);
  }
}

const init = async () => {
  await create()
  await store()
}

const main = async query => {
  const results = await search(query);
  console.log(results);
}

const args = process.argv.slice(2);

main(args.join(' '))
