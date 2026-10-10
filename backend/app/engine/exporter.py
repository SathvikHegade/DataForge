import io
from typing import Optional, List, Tuple
import polars as pl
import pandas as pd

class DataExporter:
    @classmethod
    def export(
        cls,
        df: pl.DataFrame,
        format_type: str = "csv",
        columns: Optional[List[str]] = None,
        compression: Optional[str] = None,
        include_header: bool = True
    ) -> Tuple[bytes, str, str]:
        """
        Exports Polars DataFrame to specified format.
        Returns: (file_bytes, mime_type, file_extension)
        """
        fmt = format_type.lower().strip()
        work_df = df.select(columns) if columns else df

        if fmt == "csv":
            buf = io.BytesIO()
            work_df.write_csv(buf, include_header=include_header)
            return buf.getvalue(), "text/csv", "csv"

        elif fmt == "parquet":
            buf = io.BytesIO()
            c_type = compression if compression in ("snappy", "gzip", "zstd") else "snappy"
            work_df.write_parquet(buf, compression=c_type)
            return buf.getvalue(), "application/octet-stream", "parquet"

        elif fmt == "json":
            import json as _json
            raw = work_df.write_json()
            pretty = _json.dumps(_json.loads(raw), indent=2, ensure_ascii=False)
            return pretty.encode("utf-8"), "application/json", "json"

        elif fmt in ("xlsx", "excel"):
            buf = io.BytesIO()
            pdf = work_df.to_pandas()
            with pd.ExcelWriter(buf, engine="openpyxl") as writer:
                pdf.to_excel(writer, index=False)
            return buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"

        else:
            raise ValueError(f"Unsupported export format: '{format_type}'. Supported: csv, parquet, json, xlsx.")
