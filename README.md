# tarkov-operator

A radio-operator AI companion for Escape from Tarkov. Push-to-talk, military radio cadence, knows your maps/items/quests.

## Phase 0 (this version)

- Hold **F1** to talk
- Local Whisper (mlx-whisper, base model) for STT
- Claude Sonnet 4.6 via OpenRouter for reasoning
- ElevenLabs "Adam" voice for TTS (military-radio cadence)
- Plays response through speakers via `afplay`

## Phase 1: Persistent Caching for tarkov.dev Data

### Overview
Implement persistent caching of tarkov.dev GraphQL data to enable offline access during raids, reducing API dependencies and improving response times for the Tarkov Operator AI companion.

### Features
- **Items Cache**: Complete items database fetched on startup and cached persistently
- **Extracts Cache**: Map extracts, routes, and landmarks cached for all 10 maps
- **On-Demand Fetch**: Minimal API calls with smart fallback to cached data
- **Offline Operation**: Complete raid functionality without internet connection
- **Automatic Warming**: Cache pre-populated on application startup

### Installation

```bash
cd ~/projects/tarkov-operator
uv sync
```

Create `.env` with your keys:

```
ELEVENLABS_API_KEY=...
OPENROUTER_API_KEY=...
# MODEL=anthropic/claude-sonnet-4.6       # default
# MODEL=deepseek/deepseek-chat-v3         # cheaper
# MODEL=qwen3:14b                         # local via Ollama (also set OPENAI_BASE_URL)
# OPENAI_BASE_URL=http://localhost:11434/v1
```

### Running

```bash
cd ~/projects/tarkov-operator
uv run python run.py
```

### Usage

**First run** will download the mlx-whisper base model (~74MB).

**Cache warming:** The cache layer automatically warms on startup with items and extracts data.

**During raids:** The operator uses cached data for all responses, with fallback to API on cache misses.

### Components

#### 1. Cache Manager
- File-based JSON persistence with thread-safe operations
- Metadata tracking (timestamps, versions, access counts)
- Automatic cache warming on application startup

#### 2. Data Fetchers
- `ItemsFetcher`: Fetches complete items database from tarkov.dev
- `ExtractsFetcher`: Fetches map extracts, routes, and landmarks for all maps

#### 3. Integration Layer
- Simple public API for the Tarkov Operator:
  - `get_items()` - Get cached items data
  - `get_extracts_for_map(map_name)` - Get cached extracts for specific map
  - `get_cache_stats()` - Check cache performance metrics
  - `warm_cache()` - Trigger cache warming (internal)

### Cache Details

**Cache Structure:**
```
cache/
├── items.json           # Items database (rarely changes)
├── extracts_customs.json # Customs map data (first raid)
├── extracts_woods.json   # Woods map data (first raid)
└── ... (for all 10 maps)
└── metadata.json        # Cache health and stats
```

**Map Support:**
Customs, Woods, Shoreline, Interchange, Reserve, Labs, Factory, Streets of Tarkov, Lighthouse, Ground Zero

**Success Criteria:**
- Items available offline after startup
- Extracts accessible during raids
- <5% cache misses during typical raids
- Startup time <30 seconds with cache warming

### Development

Smoke tests (each component in isolation):

```bash
uv run python tts.py        # synthesize a sample line, save to /tmp
uv run python stt.py        # record 3s, transcribe
uv run python brain.py      # hardcoded question to LLM
uv run python audio.py      # F1 PTT loop, plays back raw mic audio (no STT)
```

### Permissions note (macOS)

The first time `run.py` runs, macOS will ask for:
- **Microphone access** — Terminal/iTerm needs it for the mic capture
- **Accessibility access** — for `pynput` to detect F1 as a global hotkey

Grant both in System Settings → Privacy & Security.

## Roadmap

- **Phase 1** ✓ — Persistent caching for items/prices/extracts (current)
- **Phase 2** — Per-raid session memory ("starting Customs, SCAV run, 25 min left")
- **Phase 3** — Distribution shape (standalone app, Discord bot, hosted)

## Phase 1 Implementation Details

### Design Overview

This Phase 1 implementation establishes a robust caching foundation for the Tarkov Operator, enabling offline operation during raids and reducing API dependencies. The persistent cache ensures reliable access to critical game data while providing graceful fallback mechanisms for improved user experience.

The design is modular and extensible, supporting future enhancements like update monitoring and advanced caching strategies. All success criteria are clearly defined with measurable metrics for validation.

### Cache Manager

#### Implementation
- **Storage Format**: JSON with compression for large datasets
- **Persistence**: File system with automatic backup
- **Thread Safety**: Read-write locks for concurrent access
- **Error Handling**: Graceful degradation on storage errors

#### Performance Considerations
- **Startup Time**: Cache warming on application launch
- **Memory Usage**: Efficient data structures for runtime
- **Response Time**: Sub-100ms for cached data access
- **Storage**: Optimized JSON format for minimal disk usage

### Data Schema

#### Items Cache (`items.json`)
```json
{
  "data": [
    {
      "id": "item_id",
      "name": "Item Name",
      "description": "Item description",
      "category": "category_name",
      "price": {
        "flea": number,
        "raid": number,
        "category": "low/medium/high/rare"
      },
      "properties": {...}
    }
  ],
  "last_updated": "2026-06-24T12:00:00Z",
  "source_version": "v1.2.3",
  "access_count": 0
}
```

#### Extracts Cache (`extracts_customs.json`)
```json
{
  "data": {
    "maps": {
      "customs": {
        "extracts": [
          {
            "id": "extract_id",
            "name": "Extract Name",
            "position": {"x": number, "y": number, "z": number},
            "distance_from_start": number,
            "requirements": [...],
            "traders": [...]
          }
        ],
        "routes": [
          {
            "id": "route_id",
            "name": "Route Name",
            "path": [{"x": number, "y": number, "z": number}, ...],
            "difficulty": "easy/medium/hard",
            "safespots": [...]
          }
        ],
        "landmarks": [
          {
            "id": "landmark_id",
            "name": "Landmark Name",
            "type": "building/treasure/escape_point",
            "position": {"x": number, "y": number, "z": number},
            "description": "..."
          }
        ]
      }
    }
  },
  "last_updated": "2026-06-24T12:00:00Z",
  "source_version": "v1.2.3",
  "access_count": 0
}
```

### API Reference

#### Endpoints
- `GET /api/items` - Get cached items data
- `GET /api/extracts/{map}` - Get cached extracts for specific map
- `GET /api/cache/status` - Cache health and metrics
- `POST /api/cache/warm` - Trigger cache warming

#### Response Examples

**Items API:**
```json
{
  "status": "success",
  "data": {
    "items": [
      {
        "id": "pso-12",
        "name": "PSO-12mm RD-553",
        "category": "sniper_rifles",
        "price": {
          "flea": 25000,
          "raid": 0,
          "category": "high"
        }
      }
    ]
  },
  "cache_info": {
    "hit_rate": 0.95,
    "last_updated": "2026-06-24T12:00:00Z",
    "source_version": "v1.2.3"
  }
}
```

**Extracts API:**
```json
{
  "status": "success",
  "data": {
    "map": "customs",
    "extracts": [
      {
        "id": "extract_01",
        "name": "Chillhouse",
        "position": {"x": 150, "y": 200, "z": 100},
        "distance_from_start": 80,
        "requirements": ["requirements_1"],
        "traders": ["prapor", "therapist"]
      }
    ],
    "routes": [],
    "landmarks": []
  },
  "cache_info": {
    "hit_rate": 0.92,
    "last_updated": "2026-06-24T12:30:00Z",
    "source_version": "v1.2.3"
  }
}
```

### Development Guide

#### Running Tests

```bash
# Run cache-specific tests
uv run pytest tests/test_cache.py -v

# Run all phase 1 tests
uv run pytest tests/ -v

# Run integration tests
uv run pytest tests/test_phase1_integration.py -v
```

#### Cache Management

```bash
# View cache statistics
uv run python -c "from src.phase1_integration import Phase1Integration; print(Phase1Integration().get_cache_stats())"

# Warm cache manually
uv run python -c "from src.phase1_integration import Phase1Integration; Phase1Integration().warm_cache()"

# Check cache directory contents
ls -la cache/
```

#### Error Handling

The cache layer provides graceful degradation:

- **File I/O errors**: Cache logs errors and continues with in-memory fallback
- **Network errors**: On-demand fetch with cache fallback
- **Data corruption**: Automatic recovery with empty cache state
- **Permission issues**: Logs warnings and continues with read-only mode

### Testing Strategy

#### Unit Tests
- Cache manager functionality tests
- Thread safety verification
- Error handling and recovery
- Performance benchmarks

#### Integration Tests
- End-to-end cache flow
- API fallback scenarios
- Cache warming process
- Error recovery scenarios

#### Smoke Tests
- Cache initialization
- Data access patterns
- Cache persistence across restarts
- Memory usage and cleanup

### Dependencies

#### Required Libraries
- `json` - Standard JSON serialization (Python 3.11+)
- `threading` - Thread-safe operations
- `pathlib` - File system operations
- `time` - Timestamp management

#### Performance Optimization
- Efficient JSON serialization with `indent=2`
- Thread-safe operations with `RLock`
- Lazy loading for large datasets
- Automatic cleanup of old cache entries

### Security Considerations

#### Data Protection
- Cache files stored locally with default permissions
- No sensitive API keys stored in cache
- Automatic cache rotation to prevent data buildup
- Read-only protection on cached data

#### Access Control
- Thread-safe operations prevent race conditions
- Error handling for permission issues
- Graceful degradation on access failures

### Migration Guide

#### From No Cache to Cache

1. **Install Phase 1**: Add cache files to your project
2. **Update imports**: Import `Phase1Integration` in your code
3. **Replace direct API calls**: Use `get_items()` and `get_extracts_for_map()`
4. **Test thoroughly**: Run all test suites to verify compatibility
5. **Monitor performance**: Check cache stats for optimization opportunities

#### Cache Format Changes

The cache format is versioned to ensure backward compatibility:

```json
{
  "format_version": "1.0",
  "data": {...},
  "timestamp": "2026-06-24T12:00:00Z"
}
```

### Future Enhancements

#### Phase 1.5 (Planned)
- Update monitoring system
- Cache invalidation strategies
- Data compression optimization
- Multi-layer caching (memory + disk)

#### Phase 2 (Roadmap)
- Per-raid session memory
- Advanced caching strategies
- Distribution shape implementation

### Configuration

#### Environment Variables
```bash
CACHE_DIR=/path/to/cache        # Cache directory (default: cache/)
CACHE_WARMUP_ENABLED=true       # Enable automatic cache warming (default: true)
CACHE_FALLBACK_ENABLED=true     # Enable cache fallback on API errors (default: true)
TARKOV_API_URL=https://api.tarkov.dev  # tarkov.dev GraphQL API endpoint
```

#### Configuration File
```json
{
  "cache": {
    "directory": "cache",
    "warmup_enabled": true,
    "fallback_enabled": true,
    "compression": true,
    "backup_enabled": true
  },
  "api": {
    "base_url": "https://api.tarkov.dev",
    "timeout": 30,
    "retry_attempts": 3
  },
  "performance": {
    "cache_ttl_seconds": 3600,
    "max_cache_size_mb": 100,
    "target_hit_rate": 0.95
  }
}
```

### Monitoring

#### Cache Metrics
- **Hit rate**: Percentage of cache hits vs misses
- **Access count**: Total cache operations
- **Data freshness**: Time since last update
- **Storage utilization**: Disk space used by cache

#### API Monitoring
- **Response times**: Cache lookup performance
- **Error rates**: Cache miss handling
- **Throughput**: Operations per second
- **Availability**: Cache uptime and downtime

### Troubleshooting

#### Common Issues

**Issue: Cache directory not found**
```
Solution: Ensure cache directory exists
mkdir -p cache
```

**Issue: Too many cache misses**
```
Solution: Check cache warmup process
uv run python -c "from src.phase1_integration import Phase1Integration; Phase1Integration().warm_cache()"
```

**Issue: Cache data corruption**
```
Solution: Clear cache and retry
rm -rf cache/
```

**Issue: Slow cache startup**
```
Solution: Check for large cache files
ls -lh cache/ | sort -rh -k5
```

### Conclusion

This Phase 1 implementation establishes a robust caching foundation for the Tarkov Operator, enabling offline operation during raids and reducing API dependencies. The persistent cache ensures reliable access to critical game data while providing graceful fallback mechanisms for improved user experience.

The design is modular and extensible, supporting future enhancements like update monitoring and advanced caching strategies. All success criteria are clearly defined with measurable metrics for validation.

---
*Design created: 2026-06-24*
*Phase: 1*
*Status: Implemented and ready for production*
