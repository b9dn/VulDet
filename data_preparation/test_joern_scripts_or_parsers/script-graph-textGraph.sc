import io.shiftleft.semanticcpg.language._
import io.shiftleft.codepropertygraph.generated.EdgeTypes
import io.shiftleft.codepropertygraph.generated.nodes
import java.nio.file._
def astEdges(n:nodes.StoredNode):List[String]={n.outE(EdgeTypes.AST).l.map(e=>s"${e.src} --[AST]--> ${e.dst}")}
def cfgEdges(n:nodes.StoredNode):List[String]={n.outE.l.filter(e=>e.label==EdgeTypes.CFG||e.label==EdgeTypes.CFG_TRUE||e.label==EdgeTypes.CFG_FALSE).map(e=>s"${e.src} --[${e.label}]--> ${e.dst}")}
def astCfgEdgesForMethod(m:nodes.Method):List[String]={val allNodes=(m.astMinusRoot.l++m.cfgNode.l).distinct;allNodes.flatMap(n=>astEdges(n)++cfgEdges(n))}
val lines=cpg.method.filterNot(_.isExternal).filterNot(_.name.startsWith("<operator>")).l.flatMap(m=>s"# FUNCTION ${m.fullName}"::astCfgEdgesForMethod(m))
Files.write(Paths.get("edges.txt"),lines.mkString("\n").getBytes)
