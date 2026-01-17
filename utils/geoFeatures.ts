import { DataRow, CleaningLog } from '@/types/dataset';

// Detect latitude/longitude columns
export function detectGeoColumns(columns: string[]): { latColumn?: string; lonColumn?: string } {
  const latPatterns = ['lat', 'latitude', 'lat_', '_lat', 'y'];
  const lonPatterns = ['lon', 'lng', 'longitude', 'lon_', '_lon', 'long', 'x'];

  let latColumn: string | undefined;
  let lonColumn: string | undefined;

  columns.forEach(col => {
    const lowerCol = col.toLowerCase();
    
    if (latPatterns.some(p => lowerCol.includes(p))) {
      latColumn = col;
    }
    if (lonPatterns.some(p => lowerCol.includes(p))) {
      lonColumn = col;
    }
  });

  return { latColumn, lonColumn };
}

// Validate geo coordinates
export function validateGeoCoordinates(
  data: DataRow[],
  latColumn: string,
  lonColumn: string
): { valid: number; invalid: number; issues: string[] } {
  let valid = 0;
  let invalid = 0;
  const issues: string[] = [];

  data.forEach((row, i) => {
    const lat = row[latColumn];
    const lon = row[lonColumn];

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      invalid++;
      return;
    }

    if (lat < -90 || lat > 90) {
      invalid++;
      if (invalid <= 3) {
        issues.push(`Row ${i}: Invalid latitude ${lat} (must be between -90 and 90)`);
      }
      return;
    }

    if (lon < -180 || lon > 180) {
      invalid++;
      if (invalid <= 3) {
        issues.push(`Row ${i}: Invalid longitude ${lon} (must be between -180 and 180)`);
      }
      return;
    }

    valid++;
  });

  return { valid, invalid, issues };
}

// Grid-based encoding
export function gridEncode(
  data: DataRow[],
  latColumn: string,
  lonColumn: string,
  gridSize: number = 0.1 // degrees
): { data: DataRow[]; log: CleaningLog } {
  const resultData = data.map(row => {
    const lat = row[latColumn];
    const lon = row[lonColumn];

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return {
        ...row,
        grid_lat: null,
        grid_lon: null,
        grid_id: null
      };
    }

    const gridLat = Math.floor(lat / gridSize);
    const gridLon = Math.floor(lon / gridSize);
    const gridId = `${gridLat}_${gridLon}`;

    return {
      ...row,
      grid_lat: gridLat,
      grid_lon: gridLon,
      grid_id: gridId
    };
  });

  return {
    data: resultData,
    log: {
      operation: 'Grid Encoding',
      details: `Encoded coordinates to grid (size: ${gridSize}°) - created grid_lat, grid_lon, grid_id columns`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// K-Means clustering for geo coordinates
export function geoCluster(
  data: DataRow[],
  latColumn: string,
  lonColumn: string,
  numClusters: number = 5,
  maxIterations: number = 100,
  seed: number = 42
): { data: DataRow[]; centroids: { lat: number; lon: number }[]; log: CleaningLog } {
  // Extract valid coordinates
  const validPoints: { index: number; lat: number; lon: number }[] = [];
  
  data.forEach((row, index) => {
    const lat = row[latColumn];
    const lon = row[lonColumn];
    if (typeof lat === 'number' && typeof lon === 'number') {
      validPoints.push({ index, lat, lon });
    }
  });

  if (validPoints.length < numClusters) {
    return {
      data,
      centroids: [],
      log: {
        operation: 'Geo Clustering',
        details: `Not enough valid coordinates (${validPoints.length}) for ${numClusters} clusters`,
        rowsAffected: 0,
        timestamp: new Date(),
        category: 'feature'
      }
    };
  }

  // Seeded random
  let currentSeed = seed;
  const seededRandom = () => {
    currentSeed = (currentSeed * 1103515245 + 12345) & 0x7fffffff;
    return currentSeed / 0x7fffffff;
  };

  // Initialize centroids randomly
  const shuffledIndices = validPoints
    .map((_, i) => ({ i, r: seededRandom() }))
    .sort((a, b) => a.r - b.r)
    .map(x => x.i);
  
  let centroids = shuffledIndices.slice(0, numClusters).map(i => ({
    lat: validPoints[i].lat,
    lon: validPoints[i].lon
  }));

  // K-means iterations
  let assignments: number[] = new Array(validPoints.length).fill(0);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign points to nearest centroid
    const newAssignments = validPoints.map(point => {
      let minDist = Infinity;
      let nearest = 0;
      
      centroids.forEach((centroid, ci) => {
        const dist = haversineDistance(point.lat, point.lon, centroid.lat, centroid.lon);
        if (dist < minDist) {
          minDist = dist;
          nearest = ci;
        }
      });
      
      return nearest;
    });

    // Check for convergence
    if (newAssignments.every((a, i) => a === assignments[i])) {
      break;
    }
    
    assignments = newAssignments;

    // Update centroids
    centroids = centroids.map((_, ci) => {
      const clusterPoints = validPoints.filter((_, pi) => assignments[pi] === ci);
      
      if (clusterPoints.length === 0) {
        return centroids[ci];
      }
      
      return {
        lat: clusterPoints.reduce((sum, p) => sum + p.lat, 0) / clusterPoints.length,
        lon: clusterPoints.reduce((sum, p) => sum + p.lon, 0) / clusterPoints.length
      };
    });
  }

  // Apply cluster assignments to data
  const clusterMap = new Map<number, number>();
  validPoints.forEach((point, pi) => {
    clusterMap.set(point.index, assignments[pi]);
  });

  const resultData = data.map((row, index) => ({
    ...row,
    geo_cluster: clusterMap.has(index) ? clusterMap.get(index)! : null
  }));

  return {
    data: resultData,
    centroids,
    log: {
      operation: 'Geo Clustering',
      details: `Created ${numClusters} geographic clusters using K-means`,
      rowsAffected: validPoints.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// Haversine distance calculation
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// H3-style hexagonal indexing (simplified)
export function hexEncode(
  data: DataRow[],
  latColumn: string,
  lonColumn: string,
  resolution: number = 7 // Lower = larger hexagons
): { data: DataRow[]; log: CleaningLog } {
  // Simplified hex grid based on resolution
  const hexSize = 0.01 * Math.pow(2, 10 - resolution); // Approximate hex size in degrees

  const resultData = data.map(row => {
    const lat = row[latColumn];
    const lon = row[lonColumn];

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return {
        ...row,
        hex_id: null,
        hex_lat: null,
        hex_lon: null
      };
    }

    // Convert to hex grid coordinates
    const hexLon = Math.floor(lon / (hexSize * 1.5)); // Adjust for hex shape
    
    // Offset every other row
    const offset = hexLon % 2 === 0 ? 0 : 0.5;
    const adjustedHexLat = Math.floor((lat / hexSize) + offset);
    
    const hexId = `h${resolution}_${adjustedHexLat}_${hexLon}`;

    return {
      ...row,
      hex_id: hexId,
      hex_lat: adjustedHexLat,
      hex_lon: hexLon
    };
  });

  return {
    data: resultData,
    log: {
      operation: 'Hexagonal Encoding',
      details: `Encoded coordinates to hex grid (resolution: ${resolution}) - created hex_id, hex_lat, hex_lon columns`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// Distance to reference point
export function addDistanceFeature(
  data: DataRow[],
  latColumn: string,
  lonColumn: string,
  refLat: number,
  refLon: number,
  featureName: string = 'distance_to_ref'
): { data: DataRow[]; log: CleaningLog } {
  const resultData = data.map(row => {
    const lat = row[latColumn];
    const lon = row[lonColumn];

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return { ...row, [featureName]: null };
    }

    const distance = haversineDistance(lat, lon, refLat, refLon);
    return { ...row, [featureName]: Math.round(distance * 100) / 100 };
  });

  return {
    data: resultData,
    log: {
      operation: 'Distance Feature',
      details: `Added distance to reference point (${refLat}, ${refLon}) as "${featureName}"`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}

// Bearing/direction to reference point
export function addBearingFeature(
  data: DataRow[],
  latColumn: string,
  lonColumn: string,
  refLat: number,
  refLon: number,
  featureName: string = 'bearing_to_ref'
): { data: DataRow[]; log: CleaningLog } {
  const resultData = data.map(row => {
    const lat = row[latColumn];
    const lon = row[lonColumn];

    if (typeof lat !== 'number' || typeof lon !== 'number') {
      return { ...row, [featureName]: null };
    }

    const dLon = toRad(refLon - lon);
    const y = Math.sin(dLon) * Math.cos(toRad(refLat));
    const x = Math.cos(toRad(lat)) * Math.sin(toRad(refLat)) -
              Math.sin(toRad(lat)) * Math.cos(toRad(refLat)) * Math.cos(dLon);
    
    let bearing = Math.atan2(y, x) * (180 / Math.PI);
    bearing = (bearing + 360) % 360; // Normalize to 0-360

    return { ...row, [featureName]: Math.round(bearing * 10) / 10 };
  });

  return {
    data: resultData,
    log: {
      operation: 'Bearing Feature',
      details: `Added bearing to reference point (${refLat}, ${refLon}) as "${featureName}"`,
      rowsAffected: data.length,
      timestamp: new Date(),
      category: 'feature'
    }
  };
}
