import io.shiftleft.semanticcpg.language._
import io.shiftleft.codepropertygraph.generated.EdgeTypes
import io.shiftleft.codepropertygraph.generated.nodes
import scala.jdk.CollectionConverters._
import java.nio.file._

def esc(s: String): String =
  s.replace("\\", "\\\\")
   .replace("\"", "\\\"")
   .replace("\n", "\\n")

def nodeToJson(n: nodes.StoredNode): String = {
  val props =
    n.propertiesMap.asScala
      .map { case (k, v) => s""""$k":"${esc(v.toString)}"""" }
      .mkString(",")

  s"""{
    "id":"${n.id}",
    "label":"${n.label}",
    "properties":{ $props }
  }"""
}

def edgesFromNode(n: nodes.StoredNode): List[String] = {
  val edges =
    n.outE(EdgeTypes.AST).l ++
    n.outE(EdgeTypes.CFG).l

  edges.map { e =>
    s"""{
      "src":"${e.src}",
      "dst":"${e.dst}",
      "label":"${e.label}"
    }"""
  }
}

def astCfgGraphForMethod(m: nodes.Method): String = {
  val astNodes = m.astMinusRoot.l
  val cfgNodes = m.cfgNode.l
  val allNodes = (astNodes ++ cfgNodes).distinct

  val nodesJson = allNodes.map(nodeToJson).mkString(",")
  val edgesJson = allNodes.flatMap(edgesFromNode).mkString(",")

  s"""{
    "nodes":[ $nodesJson ],
    "edges":[ $edgesJson ]
  }"""
}

val functionsJson =
  cpg.method
    .filterNot(_.isExternal)
    .filterNot(_.name.startsWith("<operator>"))
    .l
    .map { m =>
      s"""{
        "function":"${esc(m.fullName)}",
        "file":"${esc(m.filename)}",
        "graph":${astCfgGraphForMethod(m)}
      }"""
    }.mkString(",")

val finalJson =
  s"""{ "functions":[ $functionsJson ] }"""

println(finalJson)

import java.nio.file._

Files.write(
  Paths.get("graph.json"),
  finalJson.getBytes
)
