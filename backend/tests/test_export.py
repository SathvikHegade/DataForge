import io
import json
import polars as pl
import pytest
from app.engine.exporter import DataExporter


@pytest.fixture
def sample_df():
    return pl.DataFrame({
        "id": [1, 2, 3],
        "name": ["Alice", "Bob", "Charlie"],
        "score": [95.5, 82.0, 91.2],
    })


def test_export_csv(sample_df):
    content, mime, ext = DataExporter.export(sample_df, format_type="csv")
    assert ext == "csv"
    assert mime == "text/csv"
    assert isinstance(content, bytes)
    text = content.decode("utf-8")
    assert "id,name,score" in text
    assert "Alice" in text


def test_export_parquet(sample_df):
    content, mime, ext = DataExporter.export(sample_df, format_type="parquet")
    assert ext == "parquet"
    assert mime == "application/octet-stream"
    assert isinstance(content, bytes)
    reloaded = pl.read_parquet(io.BytesIO(content))
    assert reloaded.shape == (3, 3)
    assert reloaded.columns == ["id", "name", "score"]


def test_export_json(sample_df):
    content, mime, ext = DataExporter.export(sample_df, format_type="json")
    assert ext == "json"
    assert mime == "application/json"
    parsed = json.loads(content.decode("utf-8"))
    assert len(parsed) == 3
    assert parsed[0]["name"] == "Alice"


def test_export_excel(sample_df):
    content, mime, ext = DataExporter.export(sample_df, format_type="xlsx")
    assert ext == "xlsx"
    assert "spreadsheet" in mime
    assert len(content) > 0


def test_export_with_columns(sample_df):
    content, mime, ext = DataExporter.export(sample_df, format_type="csv", columns=["name"])
    assert ext == "csv"
    text = content.decode("utf-8")
    lines = [line.strip() for line in text.strip().split("\n") if line.strip()]
    assert lines[0] == "name"
    assert len(lines) == 4  # header + 3 rows


def test_export_unsupported_format(sample_df):
    with pytest.raises(ValueError, match="Unsupported export format"):
        DataExporter.export(sample_df, format_type="yaml")
