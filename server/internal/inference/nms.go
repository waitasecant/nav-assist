package inference

import "sort"

// iou computes Intersection-over-Union for two [x1, y1, w, h] boxes.
func iou(a, b [4]float32) float32 {
	ax2 := a[0] + a[2]
	ay2 := a[1] + a[3]
	bx2 := b[0] + b[2]
	by2 := b[1] + b[3]

	ix1 := max32(a[0], b[0])
	iy1 := max32(a[1], b[1])
	ix2 := min32(ax2, bx2)
	iy2 := min32(ay2, by2)

	if ix2 <= ix1 || iy2 <= iy1 {
		return 0
	}
	inter := (ix2 - ix1) * (iy2 - iy1)
	return inter / (a[2]*a[3] + b[2]*b[3] - inter)
}

// nmsIndices runs greedy NMS and returns the surviving indices sorted by score desc.
func nmsIndices(boxes [][4]float32, scores []float32, iouThresh float32) []int {
	idx := make([]int, len(scores))
	for i := range idx {
		idx[i] = i
	}
	sort.Slice(idx, func(i, j int) bool {
		return scores[idx[i]] > scores[idx[j]]
	})

	kept := make([]int, 0, len(idx))
	for len(idx) > 0 {
		best := idx[0]
		kept = append(kept, best)
		next := idx[:0]
		for _, i := range idx[1:] {
			if iou(boxes[best], boxes[i]) <= iouThresh {
				next = append(next, i)
			}
		}
		idx = next
	}
	return kept
}

func max32(a, b float32) float32 {
	if a > b {
		return a
	}
	return b
}

func min32(a, b float32) float32 {
	if a < b {
		return a
	}
	return b
}
