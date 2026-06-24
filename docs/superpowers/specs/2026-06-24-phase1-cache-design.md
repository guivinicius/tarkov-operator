# Phase 1 Design: Persistent Cache for Tarkov.dev Data

## Overview
Implement persistent caching of tarkov.dev GraphQL data to enable offline access during raids, reducing API dependencies and improving response times for the Tarkov Operator AI companion.

## Goals
- Fetch items data on startup and cache it persistently
- Fetch map extracts, routes, and landmarks on first raid and cache them
- Provide fallback to cached data when API is unavailable
- Enable offline operation during raids
- Prepare foundation for future update monitoring

## Architecture

### Components

#### 1. Cache Manager (`cache.py`)
- **Purpose**: Persistent JSON-based caching with metadata tracking
- **Features**:
  - File-based storage with automatic directory creation
  - Thread-safe read/write operations
  - Cache metadata (timestamps, source versions)
  - Automatic cache warming on startup
  - Cache hit/miss tracking

#### 2. Data Fetchers (`fetchers.py`)
- **ItemsFetcher**: Fetches complete items database from tarkov.dev
- **PricesFetcher**: Fetches flea market pricing data
- **ExtractsFetcher**: Fetches map extracts, routes, and landmarks
- **Features**:
  - On-demand fetch with cache fallback
  - Graceful error handling
  - Cache population on first access
  - API rate limiting awareness

#### 3. Integration Layer (`phase1_integration.py`)
- **Purpose**: Simple API for operator to access cached data
- **Features**:
  - Unified interface for all cached data types
  - Cache miss handling and fallback logic
  - Data validation and sanitization
  - Performance metrics tracking

### Data Flow

1. **Application Startup**:
   - Initialize cache directory
   - Check for existing items cache
   - If missing, fetch items data from tarkov.dev
   - Store in persistent cache with metadata

2. **First Raid**:
   - Check for existing extracts cache
   - If missing, fetch extracts data from tarkov.dev
   - Store in persistent cache with metadata

3. **During Raid**:
   - All data access goes through cache layer
   - Automatic fallback to cached data if API unavailable
   - Minimal API calls during active gameplay

4. **Background Operations**:
   - Cache health monitoring
   - Periodic cache validation
   - Performance metrics collection

### Cache Structure

```
./cache/
├── items.json
│   ├── data: complete items database
│   ├── last_updated: ISO timestamp
│   ├── source_version: tarkov.dev version
│   └── access_count: usage metrics
├── extracts.json
│   ├── data: map extracts, routes, landmarks
│   ├── last_updated: ISO timestamp
│   ├── source_version: tarkov.dev version
│   └── access_count: usage metrics
└── metadata.json
    ├── cache_version: schema version
    ├── created_at: creation timestamp
    └── stats: aggregate metrics
```

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

#### Extracts Cache (`extracts.json`)
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

### Implementation Details

#### Cache Manager Implementation
- **Storage Format**: JSON with compression for large datasets
- **Persistence**: File system with automatic backup
- **Thread Safety**: Read-write locks for concurrent access
- **Error Handling**: Graceful degradation on storage errors

#### Fetcher Implementation
- **API Integration**: GraphQL queries to tarkov.dev
- **Rate Limiting**: Respect API limits with exponential backoff
- **Caching Strategy**: Population on first access, fallback to cache
- **Data Validation**: Schema validation and sanitization

#### Performance Considerations
- **Startup Time**: Cache warming on application launch
- **Memory Usage**: Efficient data structures for runtime
- **Response Time**: Sub-100ms for cached data access
- **Storage**: Optimized JSON format for minimal disk usage

### Success Criteria

#### Functional Requirements
- [ ] Items data available offline after startup
- [ ] Extracts data accessible during raids
- [ ] Cache persists across application restarts
- [ ] Fallback to cached data when API unavailable
- [ ] Minimal API calls during active gameplay

#### Non-Functional Requirements
- [ ] Cache hit rate >95% during typical raids
- [ ] Startup time <30 seconds with cache warming
- [ ] Data consistency maintained across updates
- [ ] Thread-safe concurrent access
- [ ] Error resilience with graceful degradation

#### Performance Metrics
- Cache hit rate tracking
- API call reduction percentage
- Response time improvements
- Storage utilization monitoring

### Integration Points

#### With Existing Code
- **brain.py**: Access cached data for operator responses
- **persona.py**: Enhanced knowledge base with cached items/extracts
- **run.py**: Background cache management
- **audio.py**: Context-aware responses using cached data

#### API Endpoints
- `/api/items`: Get cached items data
- `/api/extracts/{map}`: Get cached extracts for specific map
- `/api/cache/status`: Cache health and metrics
- `/api/cache/warm`: Trigger cache warming

### Testing Strategy

#### Unit Tests
- Cache manager functionality
- Fetcher error handling
- Data validation
- Thread safety

#### Integration Tests
- End-to-end cache flow
- API fallback scenarios
- Performance benchmarks
- Error recovery

#### Smoke Tests
- Cache initialization
- Data access patterns
- Cache persistence
- Memory usage

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

### Risks and Mitigations

#### Risks
- **Data Staleness**: Items change infrequently, but monitor for updates
- **Storage Failures**: Graceful degradation to memory cache
- **API Dependencies**: Fallback to cached data
- **Performance Degradation**: Cache optimization and cleanup

#### Mitigations
- Monitor tarkov.dev for patch notes
- Implement backup cache strategies
- Implement cache warming on startup
- Regular cache maintenance and cleanup

### Dependencies

#### Required Libraries
- `json` - Standard JSON serialization
- `threading` - Thread-safe operations
- `pathlib` - File system operations
- `time` - Timestamp management

#### Optional Enhancements
- `redis` - In-memory cache layer
- `aiofiles` - Async file operations
- `lz4` - Data compression
- `psutil` - System resource monitoring

### Deployment Considerations

#### Environment Variables
```bash
CACHE_DIR=/path/to/cache
CACHE_WARMUP_ENABLED=true
CACHE_FALLBACK_ENABLED=true
TARKOV_API_URL=https://api.tarkov.dev
```

#### Configuration
- Cache directory permissions
- Cache size limits
- API rate limits
- Update intervals

#### Monitoring
- Cache hit/miss ratios
- API call metrics
- Storage utilization
- Error rates

## Conclusion

This Phase 1 implementation establishes a robust caching foundation for the Tarkov Operator, enabling offline operation during raids and reducing API dependencies. The persistent cache ensures reliable access to critical game data while providing graceful fallback mechanisms for improved user experience.

The design is modular and extensible, supporting future enhancements like update monitoring and advanced caching strategies. All success criteria are clearly defined with measurable metrics for validation.

---
*Design created: 2026-06-24*
*Phase: 1*
*Status: Ready for implementation*