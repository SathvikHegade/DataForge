import math
import re
from typing import Dict, Any, List, Optional, Tuple
import polars as pl
import numpy as np

class DataTransformer:
    @classmethod
    def apply_transformation(
        cls,
        df: pl.DataFrame,
        operation: str,
        params: Dict[str, Any]
    ) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        df = cls._normalize_missing_values(df)
        rows_before = df.height
        cols_before = df.width
        op = operation.lower().strip()

        # Route to handler
        if op == "drop_missing":
            res_df, details = cls._drop_missing(df, params)
        elif op == "fill_missing_constant":
            res_df, details = cls._fill_missing_constant(df, params)
        elif op in ("fill_missing_mean", "fill_missing_median", "fill_missing_mode"):
            res_df, details = cls._fill_missing_statistic(df, params, op.replace("fill_missing_", ""))
        elif op == "fill_missing":
            # Generic fill_missing that routes by 'strategy' param
            strategy = str(params.get("strategy", "mean")).lower()
            if strategy == "constant":
                res_df, details = cls._fill_missing_constant(df, params)
            else:
                res_df, details = cls._fill_missing_statistic(df, params, strategy)
        elif op in ("remove_duplicates", "drop_duplicates"):
            res_df, details = cls._remove_duplicates(df, params)
        elif op == "cast_type":
            res_df, details = cls._cast_type(df, params)
        elif op == "rename_column":
            res_df, details = cls._rename_column(df, params)
        elif op == "drop_column":
            res_df, details = cls._drop_column(df, params)
        elif op == "select_columns":
            res_df, details = cls._select_columns(df, params)
        elif op == "duplicate_column":
            res_df, details = cls._duplicate_column(df, params)
        elif op == "trim_whitespace":
            res_df, details = cls._trim_whitespace(df, params)
        elif op == "change_case":
            res_df, details = cls._change_case(df, params)
        elif op == "replace_text":
            res_df, details = cls._replace_text(df, params)
        elif op == "normalize_strings":
            res_df, details = cls._normalize_strings(df, params)
        elif op == "parse_dates":
            res_df, details = cls._parse_dates(df, params)
        elif op == "standard_scale":
            res_df, details = cls._standard_scale(df, params)
        elif op == "min_max_scale":
            res_df, details = cls._min_max_scale(df, params)
        elif op == "log_transform":
            res_df, details = cls._log_transform(df, params)
        elif op == "one_hot_encode":
            res_df, details = cls._one_hot_encode(df, params)
        elif op == "ordinal_encode":
            res_df, details = cls._ordinal_encode(df, params)
        elif op == "handle_outliers":
            res_df, details = cls._handle_outliers(df, params)
        elif op == "filter_rows":
            res_df, details = cls._filter_rows(df, params)
        elif op == "sort_rows":
            res_df, details = cls._sort_rows(df, params)
        else:
            raise ValueError(f"Unsupported transformation operation: '{operation}'.")

        summary = {
            "operation": operation,
            "parameters": params,
            "rows_before": rows_before,
            "rows_after": res_df.height,
            "columns_before": cols_before,
            "columns_after": res_df.width,
            "rows_affected": abs(rows_before - res_df.height),
            "columns_affected": abs(cols_before - res_df.width),
            "details": details
        }
        return res_df, summary

    # ------------------ HANDLERS ------------------

    @staticmethod
    def _validate_columns(df: pl.DataFrame, cols: List[str]):
        missing = [c for c in cols if c not in df.columns]
        if missing:
            raise ValueError(f"Columns not found in dataset: {missing}")

    @staticmethod
    def _normalize_missing_values(df: pl.DataFrame) -> pl.DataFrame:
        numeric_columns = [column for column, dtype in zip(df.columns, df.dtypes) if dtype.is_float()]
        if not numeric_columns:
            return df
        return df.with_columns([
            pl.when(pl.col(column).is_nan() | pl.col(column).is_infinite())
            .then(None)
            .otherwise(pl.col(column))
            .alias(column)
            for column in numeric_columns
        ])

    @staticmethod
    def _parse_boolean(value: Any) -> Optional[bool]:
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float, np.number)) and value in (0, 1):
            return bool(value)
        normalized = str(value).strip().lower()
        if normalized in {"true", "1", "yes", "t", "y"}:
            return True
        if normalized in {"false", "0", "no", "f", "n"}:
            return False
        return None

    @classmethod
    def _cast_default_value(cls, value: Any, target_type: str) -> Any:
        if target_type == "integer":
            return int(value)
        if target_type == "float":
            return float(value)
        if target_type == "boolean":
            parsed = cls._parse_boolean(value)
            if parsed is None:
                raise ValueError("default_value must be a boolean, 0/1, or a recognized true/false string")
            return parsed
        if target_type in ("date", "datetime"):
            return str(value)
        return str(value)

    @classmethod
    def _drop_missing(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        how = params.get("how", "any") # "any" or "all"
        if columns:
            cls._validate_columns(df, columns)
            target_cols = columns
        else:
            target_cols = df.columns

        if how == "all":
            # Drop row only if all target_cols are null
            conditions = [pl.col(c).is_not_null() for c in target_cols]
            combined = conditions[0]
            for cond in conditions[1:]:
                combined = combined | cond
            new_df = df.filter(combined)
        else:
            new_df = df.drop_nulls(subset=target_cols)

        dropped = df.height - new_df.height
        return new_df, {"rows_dropped": dropped, "target_columns": target_cols}

    @classmethod
    def _fill_missing_constant(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        value = params.get("value")
        if not columns:
            raise ValueError("'columns' parameter is required for fill_missing_constant.")
        cls._validate_columns(df, columns)

        exprs = []
        for col in columns:
            dtype = df[col].dtype
            # Attempt type cast of constant to match column
            try:
                if dtype.is_integer():
                    c_val = int(value)
                elif dtype.is_float():
                    c_val = float(value)
                elif dtype == pl.Boolean:
                    c_val = cls._parse_boolean(value)
                    if c_val is None:
                        raise ValueError("Boolean fill value is invalid")
                else:
                    c_val = str(value)
            except Exception:
                c_val = value
            exprs.append(pl.col(col).fill_null(c_val).alias(col))

        new_df = df.with_columns(exprs)
        return new_df, {"filled_columns": columns, "fill_value": value}

    @classmethod
    def _fill_missing_statistic(cls, df: pl.DataFrame, params: Dict[str, Any], stat: str) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        if not columns:
            raise ValueError(f"'columns' parameter is required for fill_missing_{stat}.")
        cls._validate_columns(df, columns)

        exprs = []
        computed = {}
        for col in columns:
            series = df[col]
            if not series.dtype.is_numeric() and stat in ("mean", "median"):
                raise ValueError(f"Cannot calculate {stat} on non-numeric column '{col}'.")

            if stat == "mean":
                fill_val = series.mean()
            elif stat == "median":
                fill_val = series.median()
            elif stat == "mode":
                mode_series = series.mode()
                fill_val = mode_series[0] if len(mode_series) > 0 else None
            else:
                fill_val = None

            if fill_val is not None:
                exprs.append(pl.col(col).fill_null(fill_val).alias(col))
                computed[col] = float(fill_val) if isinstance(fill_val, (int, float, np.number)) else str(fill_val)

        new_df = df.with_columns(exprs) if exprs else df
        return new_df, {"stat": stat, "filled_values": computed}

    @classmethod
    def _remove_duplicates(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        subset = params.get("subset") or None
        keep = params.get("keep", "first") # "first" or "last"
        if subset:
            cls._validate_columns(df, subset)

        maintain_order = True
        new_df = df.unique(subset=subset, keep=keep, maintain_order=maintain_order)
        removed = df.height - new_df.height
        return new_df, {"rows_removed": removed, "subset": subset, "keep": keep}

    @staticmethod
    def _sanitize_numeric_string(value: Any) -> Optional[str]:
        if value is None:
            return None
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return str(int(value)) if float(value).is_integer() else str(value)

        text = str(value).strip()
        if text == "" or text.lower() in {"na", "n/a", "null", "none", "nan", "unknown", "undefined", "-", "--"}:
            return None

        # Remove common formatting characters for numeric-like strings.
        cleaned = text.replace(",", "").replace("$", "").replace("€", "").replace("£", "")
        cleaned = cleaned.replace("%", "")
        cleaned = re.sub(r"(?i)\b(?:year|years|yr|yrs|annual|salary|usd|eur|gbp)\b", "", cleaned)
        cleaned = cleaned.strip()

        numeric_pattern = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"
        if not re.fullmatch(numeric_pattern, cleaned):
            return None
        return cleaned

    @classmethod
    def _cast_type(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        column = params.get("column")
        target_type = params.get("target_type", "").lower().strip()
        invalid_strategy = params.get("invalid_strategy", "coerce_null") # "coerce_null", "replace_default", "raise"
        default_value = params.get("default_value")

        if not column or column not in df.columns:
            raise ValueError(f"Column '{column}' is required and must exist.")

        series = df[column]
        original_series = df[column]
        original_nulls = original_series.null_count()

        if target_type in ("integer", "float") and series.dtype in (pl.String, pl.Utf8, pl.Object):
            cleaned_expr = (
                pl.col(column)
                .map_elements(cls._sanitize_numeric_string, return_dtype=pl.String)
                .str.replace_all(r"\s+", "")
                .str.strip_chars()
            )
            df = df.with_columns(cleaned_expr.alias(column))

        if target_type == "integer":
            pl_dtype = pl.Int64
        elif target_type == "float":
            pl_dtype = pl.Float64
        elif target_type in ("string", "text"):
            pl_dtype = pl.String
        elif target_type == "boolean":
            pl_dtype = pl.Boolean
        elif target_type == "date":
            pl_dtype = pl.Date
        elif target_type == "datetime":
            pl_dtype = pl.Datetime
        elif target_type in ("categorical", "category"):
            pl_dtype = pl.Categorical
        else:
            raise ValueError(f"Unsupported target type: {target_type}")

        if target_type == "boolean":
            expr = pl.col(column).map_elements(cls._parse_boolean, return_dtype=pl.Boolean).alias(column)
        elif target_type in ("date", "datetime"):
            format_string = params.get("format")
            parsed_dtype = pl.Date if target_type == "date" else pl.Datetime
            expr = pl.col(column).cast(pl.String).str.strptime(
                parsed_dtype,
                format=format_string,
                strict=(invalid_strategy == "raise"),
            ).alias(column)
        else:
            strict = (invalid_strategy == "raise")
            expr = pl.col(column).cast(pl_dtype, strict=strict).alias(column)

        try:
            new_df = df.with_columns(expr)
        except Exception as exc:
            if invalid_strategy == "raise":
                raise ValueError(f"Column '{column}' contains values that cannot be converted to {target_type}.") from exc
            raise
        invalid_count = max(0, new_df[column].null_count() - original_nulls)
        if invalid_strategy == "raise" and invalid_count > 0:
            raise ValueError(f"Column '{column}' contains {invalid_count} values that cannot be converted to {target_type}.")
        if invalid_strategy == "replace_default" and default_value is not None:
            replacement = cls._cast_default_value(default_value, target_type)
            new_df = new_df.with_columns(pl.col(column).fill_null(replacement).alias(column))

        return new_df, {
            "column": column,
            "source_type": str(original_series.dtype),
            "target_type": target_type,
            "invalid_strategy": invalid_strategy,
            "invalid_count": invalid_count,
            "valid_count": max(0, original_series.len() - original_nulls - invalid_count),
            "new_null_count": max(0, new_df[column].null_count() - original_nulls),
        }

    @classmethod
    def _rename_column(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        mapping = params.get("mapping") or {}
        if not mapping:
            # Also support old_name / new_name format
            if params.get("old_name") and params.get("new_name"):
                mapping = {params["old_name"]: params["new_name"]}
            else:
                raise ValueError("Column mapping is required for rename_column.")

        cls._validate_columns(df, list(mapping.keys()))
        new_df = df.rename(mapping)
        return new_df, {"renamed": mapping}

    @classmethod
    def _drop_column(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        if isinstance(columns, str):
            columns = [columns]
        if not columns:
            raise ValueError("'columns' parameter is required for drop_column.")
        cls._validate_columns(df, columns)
        if len(columns) >= df.width:
            raise ValueError("Cannot drop all columns in dataset.")
        new_df = df.drop(columns)
        return new_df, {"dropped_columns": columns}

    @classmethod
    def _select_columns(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        if not columns:
            raise ValueError("'columns' parameter is required for select_columns.")
        cls._validate_columns(df, columns)
        new_df = df.select(columns)
        return new_df, {"selected_columns": columns}

    @classmethod
    def _duplicate_column(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        source = params.get("source_column")
        new_col = params.get("new_column")
        if not source or not new_col:
            raise ValueError("source_column and new_column are required.")
        cls._validate_columns(df, [source])
        if new_col in df.columns:
            raise ValueError(f"Column '{new_col}' already exists.")
        new_df = df.with_columns(pl.col(source).alias(new_col))
        return new_df, {"source": source, "new_column": new_col}

    @classmethod
    def _trim_whitespace(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        if not columns:
            columns = [c for c, dt in zip(df.columns, df.dtypes) if dt in (pl.String, pl.Utf8)]
        cls._validate_columns(df, columns)
        exprs = [pl.col(c).str.strip_chars().alias(c) for c in columns]
        new_df = df.with_columns(exprs)
        return new_df, {"trimmed_columns": columns}

    @classmethod
    def _change_case(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        case = params.get("case", "lower").lower() # lower, upper, title
        if case not in {"lower", "upper", "title"}:
            raise ValueError("case must be one of: lower, upper, title.")
        if not columns:
            raise ValueError("'columns' parameter is required.")
        cls._validate_columns(df, columns)

        exprs = []
        for c in columns:
            if case == "lower":
                exprs.append(pl.col(c).str.to_lowercase().alias(c))
            elif case == "upper":
                exprs.append(pl.col(c).str.to_uppercase().alias(c))
            elif case == "title":
                exprs.append(pl.col(c).str.to_titlecase().alias(c))
        new_df = df.with_columns(exprs)
        return new_df, {"columns": columns, "case": case}

    @classmethod
    def _replace_text(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        pattern = params.get("pattern", "")
        replacement = params.get("replacement", "")
        is_regex = params.get("is_regex", False)
        if not columns:
            raise ValueError("'columns' parameter is required.")
        cls._validate_columns(df, columns)

        exprs = []
        for c in columns:
            if is_regex:
                exprs.append(pl.col(c).str.replace_all(pattern, replacement).alias(c))
            else:
                exprs.append(pl.col(c).str.replace_all(pattern, replacement, literal=True).alias(c))
        new_df = df.with_columns(exprs)
        return new_df, {"columns": columns, "pattern": pattern, "replacement": replacement}

    @classmethod
    def _normalize_strings(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        if not columns:
            columns = [c for c, dt in zip(df.columns, df.dtypes) if dt in (pl.String, pl.Utf8)]
        cls._validate_columns(df, columns)

        # Trim + collapse multiple spaces + lowercase
        exprs = [
            pl.col(c)
            .str.strip_chars()
            .str.replace_all(r"\s+", " ")
            .alias(c)
            for c in columns
        ]
        new_df = df.with_columns(exprs)
        return new_df, {"normalized_columns": columns}

    @classmethod
    def _parse_dates(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        date_format = params.get("format") # e.g. "%Y-%m-%d"
        extract_components = params.get("extract_components") or [] # ["year", "month", "day"]
        if not columns:
            raise ValueError("'columns' parameter is required.")
        cls._validate_columns(df, columns)

        exprs = []
        for c in columns:
            dtype = df[c].dtype
            if dtype in (pl.Date, pl.Datetime):
                exprs.append(pl.col(c).alias(c))
            elif dtype == pl.Object:
                object_values = pl.col(c).map_elements(
                    lambda value: None if value is None else str(value)[:10],
                    return_dtype=pl.String,
                )
                exprs.append(
                    object_values.str.to_date(format=date_format or "%Y-%m-%d", strict=False).alias(c)
                )
            elif date_format:
                exprs.append(pl.col(c).cast(pl.String).str.to_date(format=date_format, strict=False).alias(c))
            else:
                exprs.append(pl.col(c).cast(pl.String).str.to_date(strict=False).alias(c))

        new_df = df.with_columns(exprs)

        # Component extraction
        comp_exprs = []
        for c in columns:
            if "year" in extract_components:
                comp_exprs.append(pl.col(c).dt.year().alias(f"{c}_year"))
            if "month" in extract_components:
                comp_exprs.append(pl.col(c).dt.month().alias(f"{c}_month"))
            if "day" in extract_components:
                comp_exprs.append(pl.col(c).dt.day().alias(f"{c}_day"))
            if "day_of_week" in extract_components:
                comp_exprs.append(pl.col(c).dt.weekday().alias(f"{c}_weekday"))

        if comp_exprs:
            new_df = new_df.with_columns(comp_exprs)

        return new_df, {"columns": columns, "format": date_format, "extracted": extract_components}

    @classmethod
    def _standard_scale(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        if not columns:
            raise ValueError("'columns' parameter is required for standard_scale.")
        cls._validate_columns(df, columns)

        exprs = []
        stats = {}
        for c in columns:
            mean = df[c].mean()
            std = df[c].std()
            if mean is None:
                exprs.append(pl.col(c).alias(c))
                stats[c] = {"mean": None, "std": 0.0}
            elif std is not None and std > 0:
                exprs.append(((pl.col(c) - mean) / std).alias(c))
                stats[c] = {"mean": round(float(mean), 4), "std": round(float(std), 4)}
            else:
                exprs.append((pl.col(c) - mean).alias(c))
                stats[c] = {"mean": round(float(mean or 0), 4), "std": 0.0}

        new_df = df.with_columns(exprs)
        return new_df, {"scaled_columns": columns, "learned_stats": stats}

    @classmethod
    def _min_max_scale(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        min_target = float(params.get("min_target", 0.0))
        max_target = float(params.get("max_target", 1.0))
        if not columns:
            raise ValueError("'columns' parameter is required for min_max_scale.")
        cls._validate_columns(df, columns)

        exprs = []
        stats = {}
        for c in columns:
            c_min = df[c].min()
            c_max = df[c].max()
            if c_min is not None and c_max is not None and c_max > c_min:
                scaled = ((pl.col(c) - c_min) / (c_max - c_min)) * (max_target - min_target) + min_target
                exprs.append(scaled.alias(c))
                stats[c] = {"min": float(c_min), "max": float(c_max)}
            elif c_min is not None and c_max is not None:
                exprs.append(
                    pl.when(pl.col(c).is_not_null())
                    .then(pl.lit(min_target))
                    .otherwise(None)
                    .alias(c)
                )
                stats[c] = {"min": float(c_min), "max": float(c_max), "constant": True}
            else:
                exprs.append(pl.col(c).alias(c))

        new_df = df.with_columns(exprs)
        return new_df, {"scaled_columns": columns, "target_range": [min_target, max_target], "stats": stats}

    @classmethod
    def _log_transform(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        if not columns:
            raise ValueError("'columns' parameter is required for log_transform.")
        cls._validate_columns(df, columns)

        # Uses log1p: log(x + 1) for safe zero handling, sets negative to null
        exprs = []
        for c in columns:
            exprs.append(
                pl.when(pl.col(c) >= 0)
                .then(pl.col(c).log1p())
                .otherwise(None)
                .alias(c)
            )
        new_df = df.with_columns(exprs)
        return new_df, {"columns": columns, "transformation": "log1p"}

    @classmethod
    def _one_hot_encode(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        drop_first = params.get("drop_first", False)
        max_categories = int(params.get("max_categories", 20))
        if not columns:
            raise ValueError("'columns' parameter is required for one_hot_encode.")
        cls._validate_columns(df, columns)

        new_cols_added = []
        category_mapping = {}
        res_df = df
        for col in columns:
            top_vals = [str(x) for x in df[col].drop_nulls().unique(maintain_order=True)[:max_categories].to_list()]
            if drop_first and len(top_vals) > 1:
                top_vals = top_vals[1:]
            exprs = []
            for val in top_vals:
                clean_val_name = re.sub(r"\W+", "_", str(val)).strip("_")
                clean_val_name = clean_val_name or "value"
                base_name = f"{col}_{clean_val_name}"
                new_col_name = base_name
                suffix = 1
                while new_col_name in res_df.columns or new_col_name in new_cols_added:
                    new_col_name = f"{base_name}_{suffix}"
                    suffix += 1
                exprs.append((pl.col(col).cast(pl.String) == str(val)).cast(pl.Int8).alias(new_col_name))
                new_cols_added.append(new_col_name)
                category_mapping[f"{col}:{val}"] = new_col_name
            res_df = res_df.with_columns(exprs).drop(col)

        return res_df, {
            "encoded_columns": columns,
            "new_columns": new_cols_added,
            "category_mapping": category_mapping,
        }

    @classmethod
    def _ordinal_encode(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        column = params.get("column")
        order = params.get("order") or [] # List of ordered values
        if not column or not isinstance(order, list) or not order:
            raise ValueError("column and ordered categories are required.")
        cls._validate_columns(df, [column])

        mapping_expr = None
        for rank, val in enumerate(order):
            if mapping_expr is None:
                mapping_expr = pl.when(pl.col(column).cast(pl.String) == str(val)).then(rank)
            else:
                mapping_expr = mapping_expr.when(pl.col(column).cast(pl.String) == str(val)).then(rank)

        mapping_expr = mapping_expr.otherwise(None).alias(column)
        new_df = df.with_columns(mapping_expr)
        return new_df, {"column": column, "order_mapping": {str(val): i for i, val in enumerate(order)}}

    @classmethod
    def _handle_outliers(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        method = params.get("method", "iqr") # "iqr" or "zscore"
        action = params.get("action", "clip") # "clip" or "remove"
        if method not in {"iqr", "zscore"}:
            raise ValueError("method must be one of: iqr, zscore.")
        if action not in {"clip", "remove"}:
            raise ValueError("action must be one of: clip, remove.")
        if not columns:
            raise ValueError("'columns' parameter is required.")
        cls._validate_columns(df, columns)

        res_df = df
        stats = {}
        for c in columns:
            non_null = res_df[c].drop_nulls()
            if non_null.len() == 0:
                continue

            arr = non_null.to_numpy()
            if method == "iqr":
                q25 = float(np.percentile(arr, 25))
                q75 = float(np.percentile(arr, 75))
                iqr = q75 - q25
                lower = q25 - 1.5 * iqr
                upper = q75 + 1.5 * iqr
            else:
                mean = float(np.mean(arr))
                std = float(np.std(arr)) if len(arr) > 1 else 0.0
                lower = mean - 3.0 * std
                upper = mean + 3.0 * std

            stats[c] = {"lower_bound": round(lower, 2), "upper_bound": round(upper, 2)}

            if action == "clip":
                res_df = res_df.with_columns(
                    pl.when(pl.col(c) < lower)
                    .then(lower)
                    .when(pl.col(c) > upper)
                    .then(upper)
                    .otherwise(pl.col(c))
                    .alias(c)
                )
            elif action == "remove":
                res_df = res_df.filter((pl.col(c).is_null()) | ((pl.col(c) >= lower) & (pl.col(c) <= upper)))

        return res_df, {"columns": columns, "method": method, "action": action, "bounds": stats}

    @classmethod
    def _filter_rows(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        column = params.get("column")
        operator = params.get("operator", "==")
        value = params.get("value")
        if not column:
            raise ValueError("Column name is required for filter_rows.")
        cls._validate_columns(df, [column])

        # Cast value for comparison if needed
        c_dtype = df[column].dtype
        try:
            if c_dtype.is_integer():
                val = int(value)
            elif c_dtype.is_float():
                val = float(value)
            elif c_dtype == pl.Boolean:
                val = str(value).lower() in ("true", "1")
            else:
                val = str(value)
        except Exception:
            val = value

        if operator == "==":
            cond = (pl.col(column) == val)
        elif operator == "!=":
            cond = (pl.col(column) != val)
        elif operator == ">":
            cond = (pl.col(column) > val)
        elif operator == ">=":
            cond = (pl.col(column) >= val)
        elif operator == "<":
            cond = (pl.col(column) < val)
        elif operator == "<=":
            cond = (pl.col(column) <= val)
        elif operator == "contains":
            cond = pl.col(column).cast(pl.String).str.contains(str(val))
        elif operator == "is_not_null":
            cond = pl.col(column).is_not_null()
        elif operator == "is_null":
            cond = pl.col(column).is_null()
        else:
            raise ValueError(f"Unsupported filter operator: '{operator}'.")

        new_df = df.filter(cond)
        return new_df, {"column": column, "operator": operator, "value": value, "retained_rows": new_df.height}

    @classmethod
    def _sort_rows(cls, df: pl.DataFrame, params: Dict[str, Any]) -> Tuple[pl.DataFrame, Dict[str, Any]]:
        columns = params.get("columns") or []
        descending = params.get("descending", False)
        if isinstance(columns, str):
            columns = [columns]
        if not columns:
            raise ValueError("'columns' parameter is required for sort_rows.")
        cls._validate_columns(df, columns)

        new_df = df.sort(columns, descending=descending)
        return new_df, {"columns": columns, "descending": descending}
