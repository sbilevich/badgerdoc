# Copyright (c) OpenMMLab. All rights reserved.
"""Stitch several bboxes into one."""

from typing import Any, Dict, List

import numpy as np


def is_on_same_line(
    box_a: List[int], box_b: List[int], min_y_overlap_ratio: float = 0.8
) -> bool:
    """Check if two boxes are on the same line by their y-axis coordinates.

    Two boxes are on the same line if they overlap vertically, and the length
    of the overlapping line segment is greater than min_y_overlap_ratio * the
    height of either of the boxes.

    Args:
        box_a (list): bounding box to be checked
        box_b (list): bounding box to be checked
        min_y_overlap_ratio (float): The minimum vertical overlapping ratio
                                    allowed for boxes in the same line

    Returns:
        The bool flag indicating if they are on the same line
    """
    a_y_min = np.min(box_a[1::2])  #
    b_y_min = np.min(box_b[1::2])
    a_y_max = np.max(box_a[1::2])
    b_y_max = np.max(box_b[1::2])

    # Make sure that box a is always the box above another
    if a_y_min > b_y_min:
        a_y_min, b_y_min = b_y_min, a_y_min
        a_y_max, b_y_max = b_y_max, a_y_max

    if b_y_min <= a_y_max:
        if min_y_overlap_ratio is not None:
            sorted_y = sorted([b_y_min, b_y_max, a_y_max])
            overlap = sorted_y[1] - sorted_y[0]
            min_a_overlap = (a_y_max - a_y_min) * min_y_overlap_ratio
            min_b_overlap = (b_y_max - b_y_min) * min_y_overlap_ratio
            return bool(overlap >= min_a_overlap or overlap >= min_b_overlap)
        return True
    return False


def stitch_boxes_into_lines(
    boxes: List[Any], max_x_dist: int = 10, min_y_overlap_ratio: float = 0.8
) -> List[Any]:
    """Stitch fragmented boxes of words into lines.

    Note: part of its logic is inspired by @Johndirr
    (https://github.com/faustomorales/keras-ocr/issues/22)

    Args:
        boxes (list): List of ocr results to be stitched
        max_x_dist (int): The maximum horizontal distance between the closest
                    edges of neighboring boxes in the same line
        min_y_overlap_ratio (float): The minimum vertical overlapping ratio
                    allowed for any pairs of neighboring boxes in the same line

    Returns:
        merged_boxes(list[dict]): List of merged boxes and texts
    """

    if len(boxes) <= 1:
        return boxes

    merged_boxes = []

    # sort groups based on the x_min coordinate of boxes
    x_sorted_boxes = sorted(boxes, key=lambda x: np.min(x["box"][::2]))  # type: ignore
    # store indexes of boxes which are already parts of other lines
    skip_idxs = set()

    i = 0
    # locate lines of boxes starting from the leftmost one
    for i in range(len(x_sorted_boxes)):
        if i in skip_idxs:
            continue
        # the rightmost box in the current line
        rightmost_box_idx = i
        line = [rightmost_box_idx]
        for j in range(i + 1, len(x_sorted_boxes)):
            if j in skip_idxs:
                continue
            if is_on_same_line(
                x_sorted_boxes[rightmost_box_idx]["box"],
                x_sorted_boxes[j]["box"],
                min_y_overlap_ratio,
            ):
                line.append(j)
                skip_idxs.add(j)
                rightmost_box_idx = j

        # split line into lines if the distance between two neighboring
        # sub-lines' is greater than max_x_dist
        lines = []
        line_idx = 0
        lines.append([line[0]])
        for k in range(1, len(line)):
            curr_box = x_sorted_boxes[line[k]]
            prev_box = x_sorted_boxes[line[k - 1]]
            dist = np.min(curr_box["box"][::2]) - np.max(prev_box["box"][::2])
            if dist > max_x_dist:
                line_idx += 1
                lines.append([])
            lines[line_idx].append(line[k])

        # Get merged boxes
        for box_group in lines:
            merged_box: Dict[str, Any] = {}
            merged_box["text"] = " ".join(
                [x_sorted_boxes[idx]["text"] for idx in box_group]
            )
            x_min, y_min = float("inf"), float("inf")
            x_max, y_max = float("-inf"), float("-inf")
            for idx in box_group:
                x_max = max(np.max(x_sorted_boxes[idx]["box"][::2]), x_max)
                x_min = min(np.min(x_sorted_boxes[idx]["box"][::2]), x_min)
                y_max = max(np.max(x_sorted_boxes[idx]["box"][1::2]), y_max)
                y_min = min(np.min(x_sorted_boxes[idx]["box"][1::2]), y_min)
            merged_box["box"] = [
                x_min,
                y_min,
                x_max,
                y_min,
                x_max,
                y_max,
                x_min,
                y_max,
            ]
            merged_boxes.append(merged_box)

    return merged_boxes
