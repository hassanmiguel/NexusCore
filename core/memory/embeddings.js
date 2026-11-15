"use strict";

const STOPWORDS = new Set([
  "a","an","the","and","or","but","if","then","else","for","nor","so",
  "of","in","on","at","to","from","with","without","by","over","under",
  "about","after","before","during","while","as","is","are","was","were",
  "be","been","being","am","do","does","did","done","has","have","had",
  "having","will","would","shall","should","can","could","may","might",
  "must","not","no","yes","this","that","these","those","it","its",
  "i","you","he","she","they","we","us","them","my","your","his","her",
  "our","their","who","whom","which","what","when","where","why","how",
  "all","any","both","each","few","more","most","other","some","such",
  "only","own","same"
]);

const DIM = 256;
const PRIME = 33554393;

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function bucket(strings) {
  let acc = 0;
  for (const part of strings) {
    acc = (Math.imul(acc, 31) + fnv1a(part)) >>> 0;
  }
  return acc % PRIME % DIM;
}

function tokenize(text) {
  const source = String(text || "").toLowerCase().normalize("NFKC");
  const words = source.split(/[^a-z0-9]+/).filter(
    word => word.length > 1 && !STOPWORDS.has(word)
  );
  const counts = new Map();
  const charTrigrams = [];
  for (const word of words) {
    counts.set(word, (counts.get(word) || 0) + 1);
    if (word.length >= 3) {
      for (let i = 0; i <= word.length - 3; i += 1) {
        charTrigrams.push(word.slice(i, i + 3));
      }
    }
  }
  const bigrams = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    bigrams.push(words[i] + "_" + words[i + 1]);
  }
  return { words, counts, bigrams, charTrigrams };
}

function termsFrom(text) {
  const { counts, bigrams } = tokenize(text);
  const terms = {};
  for (const [word, count] of counts) terms[word] = count;
  for (const bigram of bigrams) terms[bigram] = (terms[bigram] || 0) + 1;
  return terms;
}

function toVector(terms) {
  const vector = new Float64Array(DIM);
  const entries = Object.entries(terms || {});
  if (entries.length === 0) return vector;
  const max = Math.max(1, ...entries.map(([, value]) => value));
  for (const [term, value] of entries) {
    const weight = (value / max) * Math.log(1 + value);
    const index = bucket([term]);
    vector[index] += weight;
  }
  normalize(vector);
  return vector;
}

function normalize(vector) {
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) dot += a[i] * b[i];
  return dot;
}

function keywordScore(queryTerms, itemTerms) {
  const entries = Object.entries(queryTerms);
  if (entries.length === 0) return 0;
  let hits = 0;
  let total = 0;
  const itemKeys = new Set(Object.keys(itemTerms || {}));
  for (const [term, count] of entries) {
    total += count;
    if (itemKeys.has(term)) hits += count;
  }
  return total > 0 ? hits / total : 0;
}

const cache = new WeakMap();
function vectorForItem(item) {
  if (!item) return { vector: new Float64Array(DIM), terms: {} };
  let entry = cache.get(item);
  if (!entry) {
    entry = { vector: toVector(item.terms || {}), terms: item.terms || {} };
    cache.set(item, entry);
  }
  return entry;
}

function highlightTerms(queryTerms, itemTerms) {
  const keys = new Set(Object.keys(itemTerms || {}));
  return Object.keys(queryTerms).filter(term => keys.has(term));
}

module.exports = {
  DIM,
  tokenize,
  termsFrom,
  toVector,
  cosine,
  keywordScore,
  vectorForItem,
  highlightTerms,
  fnv1a
};